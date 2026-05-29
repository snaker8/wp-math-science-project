'use client';

// ============================================================================
// ActiveInstituteContext — 대시보드 전역 활성 센터(institute) 컨텍스트
//
// super_admin / ORG_ADMIN 처럼 여러 institute 접근 가능한 사용자가
// 현재 작업할 센터를 선택. localStorage 로 페이지·세션 간 유지.
//
// 일반 강사는 자기 institute 자동 — 드롭다운 표시 X.
// ============================================================================

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface Institute {
  id: string;
  name: string;
  organizationId: string | null;
}

interface ActiveInstituteCtx {
  /** 현재 활성 센터 ID (페이지 작업의 기준) */
  activeInstituteId: string;
  /** 변경 핸들러 */
  setActiveInstituteId: (id: string) => void;
  /** 사용자가 선택 가능한 institute 목록 */
  institutes: Institute[];
  /** 드롭다운 표시 여부 (다중 institute 보유자만 true) */
  canSwitch: boolean;
  /** 로드 중 */
  loading: boolean;
  /** 사용자 권한 메타 */
  isSuperAdmin: boolean;
}

const LS_KEY = 'active-institute-id-v1';

const ActiveInstituteContext = createContext<ActiveInstituteCtx | null>(null);

export function ActiveInstituteProvider({ children }: { children: ReactNode }) {
  const [activeInstituteId, setActiveInstituteIdState] = useState<string>('');
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sr = await fetch('/api/me/scope', { cache: 'no-store' });
        if (!sr.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const sd = await sr.json();
        if (cancelled) return;

        setIsSuperAdmin(!!sd.isSuperAdmin);
        const fallbackId = (sd.instituteId as string | null) ?? '';
        const fallbackName =
          (sd.instituteName as string | null) ?? '본 센터';

        let list: Institute[] = [];

        if (sd.isSuperAdmin) {
          const ir = await fetch('/api/admin/tenancy/institutes', {
            cache: 'no-store',
          });
          if (ir.ok) {
            const id = await ir.json();
            list = ((id.institutes ?? id.data ?? []) as {
              id: string;
              name: string;
              organization_id?: string | null;
            }[]).map((i) => ({
              id: i.id,
              name: i.name,
              organizationId: i.organization_id ?? null,
            }));
          }
        } else if (sd.organizationId) {
          const ir = await fetch(
            `/api/admin/tenancy/institutes?organization_id=${sd.organizationId}`,
            { cache: 'no-store' }
          );
          if (ir.ok) {
            const id = await ir.json();
            list = ((id.institutes ?? id.data ?? []) as {
              id: string;
              name: string;
              organization_id?: string | null;
            }[]).map((i) => ({
              id: i.id,
              name: i.name,
              organizationId: i.organization_id ?? null,
            }));
          }
        }

        // 빈 list = 일반 강사 또는 권한 없음 → 자기 institute 단일
        if (list.length === 0 && fallbackId) {
          list = [
            { id: fallbackId, name: fallbackName, organizationId: null },
          ];
        }
        if (cancelled) return;
        setInstitutes(list);

        // 활성 ID 결정: localStorage → fallback → 첫 항목
        const stored =
          typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
        const validStored =
          stored && list.some((i) => i.id === stored) ? stored : null;
        const chosen =
          validStored ??
          (fallbackId && list.some((i) => i.id === fallbackId)
            ? fallbackId
            : list[0]?.id ?? '');
        setActiveInstituteIdState(chosen);
        if (typeof window !== 'undefined' && chosen) {
          localStorage.setItem(LS_KEY, chosen);
        }
      } catch {
        // 무시 — 빈 상태로 진행
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setActiveInstituteId = (id: string) => {
    setActiveInstituteIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, id);
  };

  const value = useMemo<ActiveInstituteCtx>(
    () => ({
      activeInstituteId,
      setActiveInstituteId,
      institutes,
      canSwitch: institutes.length > 1,
      loading,
      isSuperAdmin,
    }),
    [activeInstituteId, institutes, loading, isSuperAdmin]
  );

  return (
    <ActiveInstituteContext.Provider value={value}>
      {children}
    </ActiveInstituteContext.Provider>
  );
}

export function useActiveInstitute(): ActiveInstituteCtx {
  const ctx = useContext(ActiveInstituteContext);
  if (!ctx) {
    // Provider 밖에서 호출됐을 경우 안전 fallback (학생 페이지 등 — 권한 무관)
    return {
      activeInstituteId: '',
      setActiveInstituteId: () => {},
      institutes: [],
      canSwitch: false,
      loading: false,
      isSuperAdmin: false,
    };
  }
  return ctx;
}
