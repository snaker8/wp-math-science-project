'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, FolderOpen, Folder } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface BookGroup {
  id: string;
  name: string;
  children?: BookGroup[];
  isExpanded?: boolean;
}

// ============================================================================
// Mock Data
// ============================================================================

const mockBookGroups: BookGroup[] = [
  {
    id: '1',
    name: '중등 수학',
    isExpanded: true,
    children: [
      { id: '1-1', name: '중1 1학기' },
      { id: '1-2', name: '중1 2학기' },
      { id: '1-3', name: '중2 1학기' },
      { id: '1-4', name: '중2 2학기' },
    ],
  },
  {
    id: '2',
    name: '고등 수학',
    isExpanded: false,
    children: [
      { id: '2-1', name: '수학(상)' },
      { id: '2-2', name: '수학(하)' },
      { id: '2-3', name: '수학I' },
      { id: '2-4', name: '수학II' },
    ],
  },
];

const subjects = ['전체', '수학', '영어', '국어', '과학'];

// ============================================================================
// Components
// ============================================================================

const SubjectDropdown: React.FC<{
  value: string;
  options: string[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 items-center gap-2 rounded-full border border-warm-border-soft bg-white px-4 text-sm font-medium text-warm-text-secondary hover:bg-warm-surface"
      >
        <span>{value}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-warm-border-soft bg-white py-1 shadow-md">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-warm-surface ${value === option ? 'bg-warm-surface font-medium text-warm-primary' : 'text-warm-text-secondary'
                  }`}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const TreeNode: React.FC<{
  node: BookGroup;
  level: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}> = ({ node, level, selectedId, onSelect, onToggle }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) {
            onToggle(node.id);
          }
          onSelect(node.id);
        }}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${isSelected
            ? 'bg-cyan-50 text-cyan-700 font-medium'
            : 'text-warm-text-secondary hover:bg-warm-surface'
          }`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        {hasChildren ? (
          node.isExpanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-warm-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-warm-text-muted" />
          )
        ) : (
          <span className="w-4" />
        )}
        {node.isExpanded ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-cyan-500" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-warm-text-muted" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && node.isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

export default function CloudPage() {
  const [selectedSubject, setSelectedSubject] = useState('전체');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [bookGroups, setBookGroups] = useState<BookGroup[]>(mockBookGroups);

  const handleToggle = (id: string) => {
    setBookGroups((prev) =>
      prev.map((group) => {
        if (group.id === id) {
          return { ...group, isExpanded: !group.isExpanded };
        }
        if (group.children) {
          return {
            ...group,
            children: group.children.map((child) =>
              child.id === id ? { ...child, isExpanded: !child.isExpanded } : child
            ),
          };
        }
        return group;
      })
    );
  };

  const selectedGroup = selectedGroupId
    ? bookGroups.find((g) => g.id === selectedGroupId) ||
    bookGroups.flatMap((g) => g.children || []).find((c) => c.id === selectedGroupId)
    : null;

  return (
    <section className="flex h-full w-full overflow-hidden bg-warm-surface">
      <div className="flex h-full w-full min-w-0 flex-col gap-4 p-4 font-pretendard text-sm">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-1">
          <h1 className="text-xl font-semibold text-warm-text-primary">과사람클라우드 관리</h1>
          <SubjectDropdown
            value={selectedSubject}
            options={subjects}
            onChange={setSelectedSubject}
          />
        </div>

        {/* Split Panel */}
        <div className="flex min-h-0 flex-1 gap-4">
          {/* Left Panel - Tree View */}
          <div className="flex w-[28%] flex-shrink-0 flex-col rounded-2xl border border-warm-border-soft bg-white/95 shadow-sm">
            {/* Tree Header */}
            <div className="flex items-center justify-between border-b border-warm-border-soft px-4 py-3">
              <h2 className="text-sm font-semibold text-warm-text-primary">북그룹</h2>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-100"
              >
                <Plus className="h-3.5 w-3.5" />
                최상위 북그룹 추가
              </button>
            </div>

            {/* Tree Content */}
            <div className="flex-1 overflow-auto p-2">
              {bookGroups.length > 0 ? (
                <div className="space-y-0.5">
                  {bookGroups.map((group) => (
                    <TreeNode
                      key={group.id}
                      node={group}
                      level={0}
                      selectedId={selectedGroupId}
                      onSelect={setSelectedGroupId}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-warm-text-muted">
                  북그룹이 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Content Area */}
          <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-warm-border-soft bg-white/95 shadow-sm">
            {selectedGroup ? (
              <>
                {/* Content Header */}
                <div className="flex items-center justify-between border-b border-warm-border-soft px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-warm-text-primary">{selectedGroup.name}</h2>
                    <p className="mt-1 text-xs text-warm-text-muted">북그룹 상세 정보</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-warm-border-soft bg-white px-4 py-2 text-sm font-medium text-warm-text-secondary hover:bg-warm-surface"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                </div>

                {/* Content Body */}
                <div className="flex-1 overflow-auto p-6">
                  <div className="rounded-xl bg-warm-surface px-6 py-8 text-center">
                    <p className="text-sm text-warm-text-secondary">
                      <strong>{selectedGroup.name}</strong> 북그룹이 선택되었습니다.
                    </p>
                    <p className="mt-2 text-xs text-warm-text-muted">
                      이 북그룹에 포함된 시험지와 문제들을 관리할 수 있습니다.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warm-surface">
                  <Folder className="h-8 w-8 text-warm-text-muted" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-warm-text-primary">둘러볼 북그룹을 선택해 주세요</h3>
                  <p className="mt-1 text-sm text-warm-text-muted">
                    왼쪽 트리에서 북그룹을 선택하면 상세 정보가 표시됩니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
