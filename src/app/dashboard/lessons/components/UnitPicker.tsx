// 단원 선택 picker — mathsecr 트리에서 1~3단계 cascade dropdown
'use client';

import { useEffect, useState } from 'react';
import {
  listMathsecrSubjects, listMathsecrChildren, getMathsecrNode,
} from '../lib/queries-mathsecr';
import type { MathsecrNode } from '../lib/types-mathsecr';

export interface UnitPickerProps {
  value: string | null;             // 선택된 mathsecr_code
  onChange: (code: string | null, node: MathsecrNode | null) => void;
  maxDepth?: number;                // 1=과목까지, 2=대단원, 3=중단원 (기본), 4=소단원, 5=세부유형
  inline?: boolean;                 // true=가로, false=세로
}

export function UnitPicker({ value, onChange, maxDepth = 3, inline = true }: UnitPickerProps) {
  const [subjects, setSubjects] = useState<MathsecrNode[]>([]);
  const [level1, setLevel1] = useState<MathsecrNode[]>([]);
  const [level2, setLevel2] = useState<MathsecrNode[]>([]);
  const [level3, setLevel3] = useState<MathsecrNode[]>([]);
  const [level4, setLevel4] = useState<MathsecrNode[]>([]);

  const [s1, setS1] = useState<string>('');  // subject code (depth 1)
  const [s2, setS2] = useState<string>('');  // depth 2
  const [s3, setS3] = useState<string>('');  // depth 3
  const [s4, setS4] = useState<string>('');  // depth 4
  const [s5, setS5] = useState<string>('');  // depth 5

  const [loading, setLoading] = useState(true);

  // 초기 과목 로드
  useEffect(() => {
    listMathsecrSubjects().then((subs) => {
      setSubjects(subs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // 외부 value 가 바뀌면 트리 역추적
  useEffect(() => {
    if (!value) {
      setS1(''); setS2(''); setS3(''); setS4(''); setS5('');
      return;
    }
    (async () => {
      const node = await getMathsecrNode(value);
      if (!node) return;
      const parts = value.split('-');  // ['MS09', '01', '03', ...]
      setS1(parts[0] ?? '');
      setS2(parts.length >= 2 ? parts.slice(0, 2).join('-') : '');
      setS3(parts.length >= 3 ? parts.slice(0, 3).join('-') : '');
      setS4(parts.length >= 4 ? parts.slice(0, 4).join('-') : '');
      setS5(parts.length >= 5 ? parts.slice(0, 5).join('-') : '');
    })();
  }, [value]);

  // s1 변경 → level1 로드
  useEffect(() => {
    if (!s1) { setLevel1([]); return; }
    listMathsecrChildren(s1).then(setLevel1).catch(() => setLevel1([]));
  }, [s1]);

  useEffect(() => {
    if (!s2) { setLevel2([]); return; }
    listMathsecrChildren(s2).then(setLevel2).catch(() => setLevel2([]));
  }, [s2]);

  useEffect(() => {
    if (!s3) { setLevel3([]); return; }
    listMathsecrChildren(s3).then(setLevel3).catch(() => setLevel3([]));
  }, [s3]);

  useEffect(() => {
    if (!s4) { setLevel4([]); return; }
    listMathsecrChildren(s4).then(setLevel4).catch(() => setLevel4([]));
  }, [s4]);

  // 선택 변경 시 onChange 호출 (가장 깊은 선택값)
  const emit = async (newCode: string | null) => {
    if (!newCode) { onChange(null, null); return; }
    const node = await getMathsecrNode(newCode);
    onChange(newCode, node);
  };

  const handleS1 = (v: string) => {
    setS1(v); setS2(''); setS3(''); setS4(''); setS5('');
    emit(v || null);
  };
  const handleS2 = (v: string) => {
    setS2(v); setS3(''); setS4(''); setS5('');
    emit(v || s1 || null);
  };
  const handleS3 = (v: string) => {
    setS3(v); setS4(''); setS5('');
    emit(v || s2 || null);
  };
  const handleS4 = (v: string) => {
    setS4(v); setS5('');
    emit(v || s3 || null);
  };
  const handleS5 = (v: string) => {
    setS5(v);
    emit(v || s4 || null);
  };

  if (loading) return <span style={{ color: '#A89F92', fontSize: '0.85rem' }}>단원 트리 로딩…</span>;

  if (subjects.length === 0) {
    return (
      <span style={{ color: '#B44641', fontSize: '0.8rem' }}>
        ⚠ mathsecr_types 가 비어 있습니다. 시드 스크립트를 먼저 실행하세요.
      </span>
    );
  }

  const wrap: React.CSSProperties = {
    display: inline ? 'flex' : 'grid',
    gap: '0.4rem',
    flexWrap: inline ? 'wrap' : undefined,
  };

  return (
    <div style={wrap}>
      <select value={s1} onChange={(e) => handleS1(e.target.value)} style={sel}>
        <option value="">과목 선택</option>
        {subjects.map((n) => (
          <option key={n.code} value={n.code}>{n.subject_name}</option>
        ))}
      </select>

      {s1 && level1.length > 0 && maxDepth >= 2 && (
        <select value={s2} onChange={(e) => handleS2(e.target.value)} style={sel}>
          <option value="">대단원 선택</option>
          {level1.map((n) => (
            <option key={n.code} value={n.code}>{n.level1_name}</option>
          ))}
        </select>
      )}

      {s2 && level2.length > 0 && maxDepth >= 3 && (
        <select value={s3} onChange={(e) => handleS3(e.target.value)} style={sel}>
          <option value="">중단원 선택</option>
          {level2.map((n) => (
            <option key={n.code} value={n.code}>{n.level2_name}</option>
          ))}
        </select>
      )}

      {s3 && level3.length > 0 && maxDepth >= 4 && (
        <select value={s4} onChange={(e) => handleS4(e.target.value)} style={sel}>
          <option value="">소단원 선택 (선택)</option>
          {level3.map((n) => (
            <option key={n.code} value={n.code}>{n.level3_name}</option>
          ))}
        </select>
      )}

      {s4 && level4.length > 0 && maxDepth >= 5 && (
        <select value={s5} onChange={(e) => handleS5(e.target.value)} style={sel}>
          <option value="">세부유형 (선택)</option>
          {level4.map((n) => (
            <option key={n.code} value={n.code}>{n.level4_name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

const sel: React.CSSProperties = {
  padding: '0.4rem 0.6rem', border: '1px solid #D8D3CA',
  borderRadius: 2, background: '#FFF', fontSize: '0.85rem',
  fontFamily: 'inherit', color: '#2B2620',
};
