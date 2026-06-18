import { describe, it, expect } from 'vitest';
import {
  buildTreeFromDB,
  collectGroupIds,
  applyExpandedState,
  collectDescendantGroupIds,
  type DBBookGroup,
  type DBExam,
  type TreeNode,
} from './cloud-tree';

// --- factories ---
function g(id: string, parent_id: string | null = null, name = id): DBBookGroup {
  return {
    id, name, parent_id, subject: null, sort_order: 0,
    institute_id: null, created_by: null, created_at: '2026-01-01',
  };
}
function ex(id: string, bookGroupId: string | null): DBExam {
  return {
    id, title: id, fileName: id, status: 'done', problemCount: 0, hasImage: false,
    school: '', year: '', bookGroupId, subject: '공통수학1', examType: '학교기출',
    grade: '', createdAt: '2026-01-01',
  };
}
function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
}

// 트리: A(루트) > A1, A2 ; B(루트)
const GROUPS = [g('A'), g('A1', 'A'), g('A2', 'A'), g('B')];

describe('buildTreeFromDB', () => {
  it('flat 그룹을 부모-자식 트리로 변환한다', () => {
    const tree = buildTreeFromDB(GROUPS, []);
    const a = findNode(tree, 'A')!;
    expect(a.children.map((c) => c.id).sort()).toEqual(['A1', 'A2']);
    expect(findNode(tree, 'B')!.children).toHaveLength(0);
  });

  it('가상 노드 "전체"는 항상, "미분류"는 미분류 시험지 있을 때만', () => {
    const noUn = buildTreeFromDB(GROUPS, [ex('e1', 'A')]);
    expect(findNode(noUn, 'all')!.examCount).toBe(1);
    expect(findNode(noUn, 'unclassified')).toBeNull();

    const withUn = buildTreeFromDB(GROUPS, [ex('e1', 'A'), ex('e2', null)]);
    expect(findNode(withUn, 'unclassified')!.examCount).toBe(1);
    expect(findNode(withUn, 'all')!.examCount).toBe(2);
  });

  it('그룹별 examCount 를 정확히 센다 (직속만, 하위는 별도)', () => {
    const tree = buildTreeFromDB(GROUPS, [ex('e1', 'A'), ex('e2', 'A1'), ex('e3', 'A1')]);
    expect(findNode(tree, 'A')!.examCount).toBe(1);
    expect(findNode(tree, 'A1')!.examCount).toBe(2);
    expect(findNode(tree, 'A2')!.examCount).toBe(0);
  });
});

describe('collectGroupIds', () => {
  it('노드 + 모든 자손 id 를 수집한다', () => {
    const tree = buildTreeFromDB(GROUPS, []);
    expect(new Set(collectGroupIds(findNode(tree, 'A')!))).toEqual(new Set(['A', 'A1', 'A2']));
    expect(collectGroupIds(findNode(tree, 'B')!)).toEqual(['B']);
  });
});

describe('applyExpandedState', () => {
  it('expandedIds 에 든 노드만 펼침으로 복원한다', () => {
    const tree = buildTreeFromDB(GROUPS, []);
    const applied = applyExpandedState(tree, new Set(['A']));
    expect(findNode(applied, 'A')!.isExpanded).toBe(true);
    expect(findNode(applied, 'A1')!.isExpanded).toBe(false);
    // 가상 "전체"는 기본 true 였지만 set 에 없으면 false 로 통일(복원 일관성)
    expect(findNode(applied, 'all')!.isExpanded).toBe(false);
    expect(findNode(applyExpandedState(tree, new Set(['all'])), 'all')!.isExpanded).toBe(true);
  });
});

describe('collectDescendantGroupIds (낙관적 폴더 삭제)', () => {
  it('루트 + 다단계 하위까지 수집, 무관 그룹 제외', () => {
    // A > A1 > A1a ; B 별개
    const groups = [g('A'), g('A1', 'A'), g('A1a', 'A1'), g('B')];
    expect(collectDescendantGroupIds(groups, 'A')).toEqual(new Set(['A', 'A1', 'A1a']));
    expect(collectDescendantGroupIds(groups, 'A1')).toEqual(new Set(['A1', 'A1a']));
    expect(collectDescendantGroupIds(groups, 'B')).toEqual(new Set(['B']));
  });
});

// ============================================================================
// 낙관적 업데이트 변환 검증 — 핸들러가 dbGroups/dbExams 에 가하는 변형이
// 파생 트리(buildTreeFromDB)에서 올바른 결과를 내는지 end-to-end 확인.
// ============================================================================
describe('낙관적 변환 → 파생 트리 결과', () => {
  it('시험지 이동: 출발/도착 폴더 카운트가 동시에 갱신된다', () => {
    const exams = [ex('e1', 'A1')];
    // before
    let tree = buildTreeFromDB(GROUPS, exams);
    expect(findNode(tree, 'A1')!.examCount).toBe(1);
    expect(findNode(tree, 'A2')!.examCount).toBe(0);
    // 낙관적 이동 A1 → A2 (핸들러의 setDbExams map 과 동일 변형)
    const moved = exams.map((e) => (e.id === 'e1' ? { ...e, bookGroupId: 'A2' } : e));
    tree = buildTreeFromDB(GROUPS, moved);
    expect(findNode(tree, 'A1')!.examCount).toBe(0);
    expect(findNode(tree, 'A2')!.examCount).toBe(1);
    expect(findNode(tree, 'all')!.examCount).toBe(1); // 총합 불변
  });

  it('시험지 이동: 미분류(null)로 이동 시 unclassified 노드 생성', () => {
    const exams = [ex('e1', 'A1')];
    const moved = exams.map((e) => ({ ...e, bookGroupId: null }));
    const tree = buildTreeFromDB(GROUPS, moved);
    expect(findNode(tree, 'unclassified')!.examCount).toBe(1);
    expect(findNode(tree, 'A1')!.examCount).toBe(0);
  });

  it('폴더 삭제: 대상+하위가 트리에서 사라지고 총합은 불변', () => {
    const exams = [ex('e1', 'A1'), ex('e2', 'B')];
    const removeIds = collectDescendantGroupIds(GROUPS, 'A'); // A,A1,A2
    const remaining = GROUPS.filter((grp) => !removeIds.has(grp.id));
    const tree = buildTreeFromDB(remaining, exams);
    expect(findNode(tree, 'A')).toBeNull();
    expect(findNode(tree, 'A1')).toBeNull();
    expect(findNode(tree, 'B')!.examCount).toBe(1);
    expect(findNode(tree, 'all')!.examCount).toBe(2); // exam 레코드는 그대로(전체 카운트 불변)
  });

  it('폴더 생성: temp 노드가 빈 폴더로 즉시 나타난다', () => {
    const added = [...GROUPS, g('temp-1', 'A', '새폴더')];
    const tree = buildTreeFromDB(added, []);
    const t = findNode(tree, 'temp-1')!;
    expect(t.name).toBe('새폴더');
    expect(t.examCount).toBe(0);
    expect(findNode(tree, 'A')!.children.some((c) => c.id === 'temp-1')).toBe(true);
  });

  it('폴더 이름변경: 노드 name 이 즉시 바뀐다', () => {
    const renamed = GROUPS.map((grp) => (grp.id === 'A1' ? { ...grp, name: '변경됨' } : grp));
    const tree = buildTreeFromDB(renamed, []);
    expect(findNode(tree, 'A1')!.name).toBe('변경됨');
  });

  it('롤백: 스냅샷으로 되돌리면 원래 트리와 동일', () => {
    const snapshot = GROUPS;
    const optimistic = [...GROUPS, g('temp-1', 'A')];
    const before = JSON.stringify(buildTreeFromDB(snapshot, []));
    // 낙관 적용 후
    expect(JSON.stringify(buildTreeFromDB(optimistic, []))).not.toBe(before);
    // 롤백(snapshot 복원)
    expect(JSON.stringify(buildTreeFromDB(snapshot, []))).toBe(before);
  });
});
