// ============================================================================
// Navigation Configuration
// 과사람 통합 네비게이션 설정
// ============================================================================

import {
  LayoutDashboard,
  FolderOpen,
  SquarePen,
  BookOpen,
  Layers,
  Puzzle,
  Cloud,
  Upload,
  Users,
  ClipboardCheck,
  Stethoscope,
  FileText,
  BarChart3,
  Settings,
  Home,
  User,
  ClipboardList,
  Sparkles,
  ListChecks,
  HelpCircle,
  ImageIcon,
  Building2,
  UserCog,
  Shield,
  History,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  activeColor?: string;
  group?: 'main' | 'tutor' | 'system' | 'student' | 'parent';
}

// 메인 대시보드 메뉴 (선생님/학원 관리)
export const dashboardNavItems: NavItem[] = [
  {
    href: '/dashboard',
    icon: LayoutDashboard,
    label: '대시보드',
    description: '전체 현황 요약',
    group: 'main',
  },
  {
    href: '/dashboard/repository',
    icon: FolderOpen,
    label: '시험지저장소',
    description: '업로드된 시험지 관리',
    group: 'main',
  },
  {
    // ★ 2026-09-01 메뉴 노출 — 그전까지 코드는 배포돼 있었으나 메뉴에 없어
    //   주소를 직접 쳐야만 들어갈 수 있었다(사용자: "내가 보는 화면에는 안 보이는데").
    //   출처 탭(진단·학교기출·시중교재·모의고사) + 단원 트리 + 난이도 필터 +
    //   선택 트레이(실시간 난이도 분포) + 시험지 편성까지 한 화면에서 흐른다.
    //   ★ 아래 '유형별 출제'(/dashboard/create)는 **그대로 남긴다** — 기존 흐름을
    //     쓰시던 분이 있으므로 뺏지 않는다. 새 화면이 자리 잡은 뒤 정리한다.
    href: '/dashboard/exam-create',
    icon: SquarePen,
    label: '시험지 출제',
    description: '출처·단원·난이도로 문제를 골라 담고 난이도 분포를 보며 편성',
    group: 'main',
  },
  {
    href: '/dashboard/create',
    icon: SquarePen,
    label: '유형별 출제 (기존)',
    description: '단원·유형·난이도로 문제를 골라 새 시험지 제작',
    group: 'main',
  },
  {
    href: '/dashboard/materials',
    icon: BookOpen,
    label: '학원자료',
    description: '학원 교재 및 자료',
    group: 'main',
  },
  {
    href: '/dashboard/materials/diagrams',
    icon: ImageIcon,
    label: '도식 갤러리',
    description: '추출된 과학/수학 도식 이미지',
    group: 'main',
  },
  {
    href: '/dashboard/similar',
    icon: Layers,
    label: '출판교재유사',
    description: '교재별 유사문제',
    group: 'main',
  },
  {
    href: '/dashboard/skills',
    icon: Puzzle,
    label: '유형/문제관리',
    description: '단원·유형 분류 체계',
    group: 'main',
  },
  {
    href: '/dashboard/cloud',
    icon: Cloud,
    label: '클라우드',
    description: '문제·시험지 라이브러리',
    group: 'main',
  },
  {
    href: '/dashboard/exam-management',
    icon: ClipboardCheck,
    label: '자산 시험지 출제',
    description: '자산화된 시험지 그대로 인쇄·배포·출제',
    group: 'main',
  },
  {
    // ★ 2026-08-29 되살림 — 페이지·API 는 살아 있는데 메뉴 연결이 없어 URL 직접 입력으로만
    //   들어가지던 화면. AI 분류를 사람이 고친 이력(자동 학습 회로 C-2)을 보는 곳.
    href: '/dashboard/corrections',
    icon: History,
    label: '분류 보정 이력',
    description: 'AI 분류를 사람이 고친 기록 — 학습 회로 확인',
    group: 'main',
  },
];

// 교직원·운영 관리 메뉴
export const adminNavItems: NavItem[] = [
  {
    href: '/admin/staff',
    icon: Users,
    label: '교직원 관리',
    description: '강사/직원 권한 관리',
    group: 'main',
  },
  {
    href: '/admin/institutes',
    icon: Building2,
    label: '학원·센터 관리',
    description: '학원/센터 추가 (슈퍼관리자만)',
    group: 'main',
  },
  {
    href: '/admin/users',
    icon: UserCog,
    label: '사용자 배정',
    description: '학원/센터/역할 배정 (슈퍼관리자만)',
    group: 'main',
  },
  {
    href: '/admin/organization-applications',
    icon: Building2,
    label: '가맹 학원 신청',
    description: '신규 학원 가맹 신청 승인/거부 (슈퍼관리자만)',
    group: 'main',
  },
];

// 튜터/수업 관련 메뉴
// ★ 2026-09-06 반 허브 단계 9 (IA 정리, 대표 「순서대로 진행」): 반 허브가 흡수한 입구를 메뉴에서 걷었다.
//   수동 채점 입력 → 채점하기 탭 / 학생 진단·학생 성적·진단 종합 리포트 → 반 허브 학생 화면의 링크.
//   페이지 자체는 남아 있다(라우트 유지, 링크로만 진입).
export const tutorNavItems: NavItem[] = [
  {
    // ★ 검증된 자산화 경로(클라우드 페이지)로 통일 — 기존 /tutor/workflow 는
    //   exam 레코드 미생성·중복 자산화 사고가 반복되어 라우팅만 유지하고
    //   실제 기능은 /dashboard/cloud 로 보냄.
    // ★ 메뉴 위치: 문제은행 그룹 (수업관리에 있던 것을 이동, 사용자 요청).
    // ★ ?upload=1 — 클릭 시 클라우드 페이지 도착 직후 업로드 모달 자동 오픈.
    href: '/dashboard/cloud?upload=1',
    icon: Upload,
    label: 'DB 자산화',
    description: 'PDF → OCR → 학원 클라우드 저장',
    group: 'tutor',
  },
  {
    href: '/tutor/classes',
    icon: Users,
    // ★ '반 관리' 로는 여기가 반 허브 입구인 줄 모른다 (2026-09-03 대표 지적).
    label: '반',
    description: '반을 열어 학생·과제·채점을 한 화면에서',
    group: 'tutor',
  },
  {
    href: '/tutor/students',
    icon: User,
    label: '학생 관리',
    description: '학생 등록·관리 (반 없이도 가능)',
    group: 'tutor',
  },
  {
    // ★ /tutor/grading mock 제거 (2026-05-12). 실 채점은 /dashboard/grading 으로.
    href: '/dashboard/grading',
    icon: ClipboardCheck,
    label: '채점하기',
    description: 'QR 채점 세션 관리 · 학생 답 자동채점',
    group: 'tutor',
  },
  {
    href: '/tutor/clinic',
    icon: FileText,
    label: '클리닉시험지',
    description: '오답 클리닉 PDF',
    group: 'tutor',
  },
  {
    href: '/dashboard/curation',
    icon: Sparkles,
    label: 'AI 자동 출제',
    description: '자동 맞춤 문제 선정',
    group: 'tutor',
  },
  {
    href: '/dashboard/reports',
    icon: BarChart3,
    label: '학교별 리포트',
    description: '학교별 시험지 누적 분석 + 학부모 공유 관리',
    group: 'tutor',
  },
  {
    // 출제 관리 (매쓰플랫 수업>학습지 미러, 2026-06-11)
    href: '/dashboard/assignments',
    icon: ListChecks,
    label: '출제 관리',
    description: '학년·학생별 출제 현황 · 점수 (QR+수동 합산)',
    group: 'tutor',
  },
  {
    // 수업 허브 (IA Phase 2, 2026-06-12)
    href: '/dashboard/class',
    icon: Users,
    label: '수업 홈',
    description: '학생별 종합 — 학습 보고서·진단 리포트·공유링크 한 곳',
    group: 'tutor',
  },
];

// 시스템 메뉴
export const systemNavItems: NavItem[] = [
  {
    href: '/dashboard/settings',
    icon: Settings,
    label: '설정',
    description: '계정 및 환경 설정',
    group: 'system',
  },
];

// 고객지원 메뉴
export const supportNavItems: NavItem[] = [
  {
    href: '/support',
    icon: HelpCircle,
    label: '고객센터',
    description: '이용 가이드 및 문의',
    group: 'system',
  },
];

// 학생용 메뉴 — 실제 동작하는 기능만 노출 (목업 라우트 제거, P0)
export const studentNavItems: NavItem[] = [
  { href: '/student/dashboard', icon: Home, label: '홈', group: 'student' },
  { href: '/student/exams', icon: ClipboardList, label: '시험', group: 'student' },
  { href: '/student/profile', icon: User, label: '내 정보', group: 'student' },
];

// 학부모용 메뉴 — 리포트는 /parent/[token] 전용 링크로 제공 (목업 라우트 제거, P0)
export const parentNavItems: NavItem[] = [
  { href: '/parent', icon: Home, label: '홈', group: 'parent' },
];

// ============================================================================
// 상단 네비게이션 그룹 (TopNav용)
// ============================================================================

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;           // 직접 링크 (드롭다운 없음)
  children?: NavItem[];     // 드롭다운 하위 메뉴
  // ★ 권한별 노출. 미지정 시 모두 노출. 지정 시 해당 role 만 노출.
  //   role 값: 'super_admin' | 'ADMIN' | 'ORG_ADMIN' | 'TEACHER' | 'TUTOR' | 'STUDENT' | 'PARENT'
  roles?: string[];
}

// ★ 2026-06-11 IA 통합 (PLAN_IA_CONSOLIDATION.md, 매쓰플랫 워크플로우 기반):
//   8그룹에 흩어진 메뉴를 흐름 순으로 수렴.
//   - 학생 흩어진 화면(학생진단·학생성적·종합리포트·클리닉·반/학생관리)을 [수업] 한 그룹으로.
//   - 채점 중복 제거: "수동 채점 입력" 메뉴(=채점하기 ?tab=manual 탭)는 미노출. 채점하기 단일.
//   - 단일 항목 그룹(채점·분석)은 드롭다운 없이 직접 링크.
//   ※ 페이지 라우트는 전부 유지 — nav 재배치만(롤백 쉬움). Phase 2 에서 [수업] 허브 페이지화.
//   ※ 대시보드 단독 메뉴 없음 — 로고 클릭으로 /dashboard 진입.
// ★ 2026-06-12 순서·소속 조정 (사용자 요청):
//   - 순서: 문제은행 → 수업 → 출제 → 채점 → 분석 → 학원자료 → DB 자산화.
//   - [출제 관리]를 수업 → 출제 그룹으로 이동 (출제 현황·점수는 출제 흐름의 끝).
//   - 출제 그룹 라벨 명확화: 유형별 출제(문제 골라 제작) vs 자산 시험지 출제(자산화 시험지 그대로).
// ★ 인덱스 참조는 배열 순서가 바뀌면 조용히 다른 메뉴를 가리킨다 (실제로 "배열 끝 append 필수"
//   주석이 여러 개 붙어 있었다). href 로 찾는 헬퍼로 교체 — 순서 바뀌어도 안전하고, 없는 항목은
//   빌드가 아니라 런타임에 조용히 사라지지 않게 예외로 드러난다.
function navItem(items: NavItem[], href: string): NavItem {
  const found = items.find((i) => i.href === href);
  if (!found) throw new Error(`[navigation] 메뉴 항목 없음: ${href}`);
  return found;
}
const dash = (href: string) => navItem(dashboardNavItems, href);
const tutor = (href: string) => navItem(tutorNavItems, href);

export const topNavGroups: NavGroup[] = [
  // ── 1) 자료 — "무엇으로 출제할 것인가". 예전엔 문제은행·학원자료·DB자산화 3탭으로
  //   흩어져 있어 자료를 찾을 때 어디를 눌러야 할지 매번 헷갈렸다 (2026-08-28 통합).
  {
    id: 'library',
    label: '자료',
    icon: FolderOpen,
    children: [
      dash('/dashboard/cloud'),              // 과사람클라우드 (시험지·문제 라이브러리)
      dash('/dashboard/skills'),             // 유형/문제관리
      dash('/dashboard/similar'),            // 출판교재유사
      dash('/dashboard/materials'),          // 학원자료
      dash('/dashboard/materials/diagrams'), // 도식 갤러리
      dash('/dashboard/corrections'),        // 분류 보정 이력 (자동 학습 회로)
    ],
  },
  // ── 2) 제작 + 배포 + 현황: 출제 ──
  {
    id: 'exams',
    label: '출제',
    icon: SquarePen,
    children: [
      // ★ 상단 메뉴는 이 목록으로 구성된다 — NAV_ITEMS 에 항목만 추가하면 화면에 안 뜬다.
      //   (2026-09-01: 항목만 넣고 여기 연결을 빠뜨려 "메뉴에 안 보인다" 재발)
      dash('/dashboard/exam-create'),      // 시험지 출제 (출처·단원·난이도 + 난이도 분포)
      dash('/dashboard/create'),           // 유형별 출제 (기존)
      tutor('/dashboard/curation'),        // AI 자동 출제
      dash('/dashboard/exam-management'),  // 자산 시험지 출제 (자산화 시험지 인쇄·배포)
      tutor('/dashboard/assignments'),     // 출제 관리 (학생별 출제 현황·점수)
    ],
  },
  // ── 3) ★ 수업(학생) — 한 학생을 한 곳에서 (매쓰플랫 "수업" 미러).
  //   수업 홈(/dashboard/class) = 허브 — 학생 선택 시 보고서·진단·공유 한 화면. ──
  {
    id: 'class',
    label: '수업',
    icon: Users,
    children: [
      // ★ 반이 맨 위 (2026-09-03). 반 허브를 만들어 놓고 메뉴에서 가는 길이 없었다 —
      //   대표가 "설명한 게 어디 있는지 모르겠다" 고 했다. 학원은 반 단위로 굴러가니
      //   [수업] 을 열면 반이 먼저 보여야 한다. 반 카드의 「반 열기」 가 허브다.
      tutor('/tutor/classes'),                 // 반 (허브 입구)
      tutor('/dashboard/class'),               // 수업 홈 (학생 종합)
      tutor('/tutor/analytics'),               // 학생 성적
      tutor('/dashboard/prescription'),        // 학생 진단
      tutor('/dashboard/prescription/report'), // 진단 종합 리포트
      tutor('/tutor/clinic'),                  // 클리닉시험지
      tutor('/tutor/students'),                // 학생 관리
    ],
  },
  // ── 4) 채점 — 단일 페이지(QR/수동 탭 내장. 엑셀 채점은 2026-09-02 제거). 직접 링크. ──
  {
    id: 'grading',
    label: '채점',
    icon: ClipboardCheck,
    href: '/dashboard/grading',
  },
  // ── 5) 분석 — 학원·학교 단위(학생 단위는 [수업]). 단일 → 직접 링크. ──
  {
    id: 'analytics',
    label: '분석',
    icon: BarChart3,
    href: '/dashboard/reports',
  },
  // ★ DB 자산화는 탭이 아니라 '행동' — TopNav 우측에 버튼으로 분리 (2026-08-28).
  //   topNavGroups 에는 남기지 않는다. TopNav 가 DB_ASSETIZE_ACTION 을 직접 렌더.
  // ★ 운영 관리 — multi-tenancy. 학원·센터·사용자/교직원 관리.
  //   페이지는 super_admin 가드로 막혀있지만 *메뉴 자체* 가 강사·학생에게도 보이면
  //   "관리자로 로그인된 것처럼" 보이는 사고. roles 필터로 노출 자체 차단.
  {
    id: 'admin-ops',
    label: '운영 관리',
    icon: Shield,
    children: adminNavItems,
    roles: ['super_admin', 'ADMIN', 'ORG_ADMIN'],
  },
];

/**
 * DB 자산화 — 네비 탭이 아니라 우측 상단 액션 버튼.
 * "업로드"는 이동(navigation)이 아니라 행동(action)이라 탭 문법이 안 맞았다.
 * TopNav 가 이 정의로 흰 필 버튼을 렌더한다. (동작: 클라우드 + 업로드 모달 자동 오픈)
 */
export const DB_ASSETIZE_ACTION = {
  id: 'db-assetize',
  label: 'DB 자산화',
  icon: Upload,
  href: '/dashboard/cloud?upload=1',
} as const;

// 전체 네비게이션 (Sidebar용 — 레거시)
export const allNavItems: NavItem[] = [
  ...dashboardNavItems,
  ...tutorNavItems,
  ...adminNavItems,
  ...systemNavItems,
  ...supportNavItems,
  ...studentNavItems,
  ...parentNavItems,
];

// Header 퀵 액션용
// ★ 2026-06-18 '시험지저장소'(dashboardNavItems[1]) 제거 — 미사용·클라우드 중복.
export const quickNavItems: NavItem[] = [
  dashboardNavItems[0], // 대시보드
  dashboardNavItems[7], // 과사람클라우드
  dashboardNavItems[2], // 시험지출제
  tutorNavItems[3],     // 채점하기 (/dashboard/grading)
  tutorNavItems[5],     // 학생 진단 (/dashboard/prescription)
];

// 현재 경로에서 활성 메뉴 찾기
export function findActiveNavItem(pathname: string): NavItem | undefined {
  // 정확히 일치하는 것 우선
  const exact = allNavItems.find(item => item.href === pathname);
  if (exact) return exact;

  // 하위 경로 일치
  return allNavItems.find(item =>
    pathname.startsWith(item.href) && item.href !== '/dashboard'
  );
}

// 그룹별 메뉴 가져오기
export function getNavItemsByGroup(group: NavItem['group']): NavItem[] {
  return allNavItems.filter(item => item.group === group);
}
