// ============================================================================
// Navigation Configuration
// 수작(Suzag) 통합 네비게이션 설정
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
  Bot,
  User,
  CreditCard,
  Sparkles,
  HelpCircle,
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
    activeColor: 'bg-primary-500/10 text-primary-500',
    group: 'main',
  },
  {
    href: '/dashboard/repository',
    icon: FolderOpen,
    label: '시험지저장소',
    description: '업로드된 시험지 관리',
    activeColor: 'bg-purple-500/10 text-purple-500',
    group: 'main',
  },
  {
    href: '/dashboard/create',
    icon: SquarePen,
    label: '시험지출제',
    description: '새 시험지 만들기',
    activeColor: 'bg-pink-500/10 text-pink-500',
    group: 'main',
  },
  {
    href: '/dashboard/materials',
    icon: BookOpen,
    label: '학원자료',
    description: '학원 교재 및 자료',
    activeColor: 'bg-emerald-500/10 text-emerald-500',
    group: 'main',
  },
  {
    href: '/dashboard/similar',
    icon: Layers,
    label: '출판교재유사',
    description: '교재별 유사문제',
    activeColor: 'bg-blue-500/10 text-blue-500',
    group: 'main',
  },
  {
    href: '/dashboard/skills',
    icon: Puzzle,
    label: '유형/문제관리',
    description: '3,569개 유형 체계',
    activeColor: 'bg-violet-500/10 text-violet-500',
    group: 'main',
  },
  {
    href: '/dashboard/cloud',
    icon: Cloud,
    label: '과사람클라우드',
    description: '클라우드 문제은행',
    activeColor: 'bg-cyan-500/10 text-cyan-500',
    group: 'main',
  },
];

// 교직원 관리 메뉴
export const adminNavItems: NavItem[] = [
  {
    href: '/admin/staff',
    icon: Users,
    label: '교직원 관리',
    description: '강사/직원 권한 관리',
    activeColor: 'bg-indigo-500/10 text-indigo-500',
    group: 'main',
  },
];

// 튜터/수업 관련 메뉴
export const tutorNavItems: NavItem[] = [
  {
    href: '/tutor/workflow',
    icon: Upload,
    label: '문제 업로드',
    description: 'OCR → AI분류 → 채점',
    activeColor: 'bg-sky-500/10 text-sky-500',
    group: 'tutor',
  },
  {
    href: '/tutor/classes',
    icon: Users,
    label: '반 관리',
    description: '학생 및 반 관리',
    activeColor: 'bg-amber-500/10 text-amber-500',
    group: 'tutor',
  },
  {
    href: '/tutor/grading',
    icon: ClipboardCheck,
    label: '채점하기',
    description: '4단계 정밀 채점',
    activeColor: 'bg-green-500/10 text-green-500',
    group: 'tutor',
  },
  {
    href: '/dashboard/prescription',
    icon: Stethoscope,
    label: 'AI처방/CLINIC',
    description: '오답 분석 및 처방',
    activeColor: 'bg-orange-500/10 text-orange-500',
    group: 'tutor',
  },
  {
    href: '/dashboard/curation',
    icon: Sparkles,
    label: 'AI 오토큐레이션',
    description: '자동 맞춤 문제 선정',
    activeColor: 'bg-purple-500/10 text-purple-500',
    group: 'tutor',
  },
  {
    href: '/tutor/clinic',
    icon: FileText,
    label: '클리닉시험지',
    description: '오답 클리닉 PDF',
    activeColor: 'bg-rose-500/10 text-rose-500',
    group: 'tutor',
  },
  {
    href: '/tutor/analytics',
    icon: BarChart3,
    label: '성적분석',
    description: '히트맵 및 통계',
    activeColor: 'bg-indigo-500/10 text-indigo-500',
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
    activeColor: 'bg-gray-500/10 text-gray-500',
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
    activeColor: 'bg-zinc-500/10 text-zinc-500',
    group: 'system',
  },
];

// 학생용 메뉴
export const studentNavItems: NavItem[] = [
  { href: '/student', icon: Home, label: '홈', group: 'student' },
  { href: '/student/study', icon: BookOpen, label: '학습', group: 'student' },
  { href: '/student/ai-tutor', icon: Bot, label: 'AI 튜터', group: 'student' },
  { href: '/student/profile', icon: User, label: '내 정보', group: 'student' },
];

// 학부모용 메뉴
export const parentNavItems: NavItem[] = [
  { href: '/parent', icon: Home, label: '홈', group: 'parent' },
  { href: '/parent/report', icon: BarChart3, label: '리포트', group: 'parent' },
  { href: '/parent/payment', icon: CreditCard, label: '결제 관리', group: 'parent' },
];

// 전체 네비게이션 (Sidebar용)
export const allNavItems: NavItem[] = [
  ...dashboardNavItems,
  ...tutorNavItems,
  ...adminNavItems,
  ...systemNavItems,
  ...supportNavItems,
  ...studentNavItems,
  ...parentNavItems,
];

// Header 퀵 액션용 (상위 5개)
export const quickNavItems: NavItem[] = [
  dashboardNavItems[0], // 대시보드
  dashboardNavItems[1], // 시험지저장소
  dashboardNavItems[2], // 시험지출제
  tutorNavItems[2],     // 채점하기
  tutorNavItems[3],     // AI처방
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
