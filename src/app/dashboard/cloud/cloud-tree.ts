// ============================================================================
// 클라우드 폴더 트리 순수 로직 — 사고 빈발 영역의 코드화(회귀 테스트 대상).
//   CloudListClient.tsx 에서 분리. UI/React 의존 없음 → node 환경 단위테스트 가능.
//   ★ 낙관적 업데이트(2026-06-18): treeNodes 를 dbGroups/dbExams 에서 파생시키므로,
//     이 모듈의 순수성이 트리·폴더카운트·목록의 원자적 일관성을 보장한다.
// ============================================================================

export interface DBBookGroup {
  id: string;
  name: string;
  parent_id: string | null;
  subject: string | null;
  sort_order: number;
  institute_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DBExam {
  id: string;
  title: string;
  fileName: string;
  status: string;
  problemCount: number;
  hasImage: boolean;
  school: string;
  year: string;
  bookGroupId: string | null;
  subject: string;
  examType: string;
  grade: string;
  createdAt: string;
  // ★ 출처별 카테고리 분류용 (Phase 1)
  isDiagnostic?: boolean;
  diagnosticCategory?: string | null;
  diagnosticRound?: string | null;  // 'R1', 'R2', ...
}

export interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  subject: string | null;
  children: TreeNode[];
  isExpanded: boolean;
  examCount: number;
  isVirtual?: boolean; // "전체 시험지", "미분류" 등 가상 노드
}

// ============================================================================
// Build tree from flat DB groups + exams
// ============================================================================
export function buildTreeFromDB(groups: DBBookGroup[], exams: DBExam[]): TreeNode[] {
  // 그룹별 시험지 수 계산
  const examCountMap = new Map<string, number>();
  let unclassifiedCount = 0;

  for (const exam of exams) {
    if (exam.bookGroupId) {
      examCountMap.set(exam.bookGroupId, (examCountMap.get(exam.bookGroupId) || 0) + 1);
    } else {
      unclassifiedCount++;
    }
  }

  // flat → tree 변환
  const nodeMap = new Map<string, TreeNode>();
  for (const g of groups) {
    nodeMap.set(g.id, {
      id: g.id,
      name: g.name,
      parentId: g.parent_id,
      subject: g.subject,
      children: [],
      isExpanded: false,
      examCount: examCountMap.get(g.id) || 0,
    });
  }

  const roots: TreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 가상 노드: 전체 시험지
  const allNode: TreeNode = {
    id: 'all',
    name: '전체 시험지',
    parentId: null,
    subject: null,
    children: [],
    isExpanded: true,
    examCount: exams.length,
    isVirtual: true,
  };

  // 가상 노드: 미분류 (book_group_id가 null인 시험지)
  const unclassifiedNode: TreeNode = {
    id: 'unclassified',
    name: '미분류',
    parentId: null,
    subject: null,
    children: [],
    isExpanded: false,
    examCount: unclassifiedCount,
    isVirtual: true,
  };

  const tree: TreeNode[] = [allNode];
  if (roots.length > 0) tree.push(...roots);
  if (unclassifiedCount > 0) tree.push(unclassifiedNode);

  return tree;
}

// 트리에서 특정 그룹 + 모든 자손 그룹의 ID를 수집
export function collectGroupIds(node: TreeNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectGroupIds(child));
  }
  return ids;
}

// ★ 확장 상태(expandedIds) 를 트리에 적용 — 파생 트리 재계산 시 펼침 상태 복원용.
//   (treeNodes 를 state 가 아니라 dbGroups/dbExams 에서 파생시키므로, 토글 상태는 ref 로 보존)
export function applyExpandedState(nodes: TreeNode[], expandedIds: Set<string>): TreeNode[] {
  return nodes.map((n) => ({
    ...n,
    isExpanded: expandedIds.has(n.id),
    children: applyExpandedState(n.children, expandedIds),
  }));
}

// ★ 특정 그룹 + 모든 하위(자손) 그룹 id 수집 — flat DBBookGroup[] 의 parent_id 추적.
//   낙관적 폴더 삭제 시 하위까지 즉시 제거하는 데 사용 (트리 없이 flat 만으로 계산).
export function collectDescendantGroupIds(groups: DBBookGroup[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const g of groups) {
      if (g.parent_id && ids.has(g.parent_id) && !ids.has(g.id)) {
        ids.add(g.id);
        added = true;
      }
    }
  }
  return ids;
}
