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
  Bot,
  User,
  CreditCard,
  Sparkles,
  HelpCircle,
  ImageIcon,
  Building2,
  UserCog,
  Shield,
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
    href: '/dashboard/materials/diagrams',
    icon: ImageIcon,
    label: '도식 갤러리',
    description: '추출된 과학/수학 도식 이미지',
    activeColor: 'bg-teal-500/10 text-teal-500',
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
    description: '단원·유형 분류 체계',
    activeColor: 'bg-violet-500/10 text-violet-500',
    group: 'main',
  },
  {
    href: '/dashboard/cloud',
    icon: Cloud,
    label: '클라우드',
    description: '문제·시험지 라이브러리',
    activeColor: 'bg-cyan-500/10 text-cyan-500',
    group: 'main',
  },
  {
    href: '/dashboard/exam-management',
    icon: ClipboardCheck,
    label: '시험지관리',
    description: '시험지 그룹 관리',
    activeColor: 'bg-amber-500/10 text-amber-500',
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
    activeColor: 'bg-indigo-500/10 text-indigo-500',
    group: 'main',
  },
  {
    href: '/admin/institutes',
    icon: Building2,
    label: '학원·센터 관리',
    description: '학원/센터 추가 (슈퍼관리자만)',
    activeColor: 'bg-indigo-500/10 text-indigo-500',
    group: 'main',
  },
  {
    href: '/admin/users',
    icon: UserCog,
    label: '사용자 배정',
    description: '학원/센터/역할 배정 (슈퍼관리자만)',
    activeColor: 'bg-indigo-500/10 text-indigo-500',
    group: 'main',
  },
  {
    href: '/admin/organization-applications',
    icon: Building2,
    label: '가맹 학원 신청',
    description: '신규 학원 가맹 신청 승인/거부 (슈퍼관리자만)',
    activeColor: 'bg-amber-500/10 text-amber-500',
    group: 'main',
  },
];

// 튜터/수업 관련 메뉴
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
    activeColor: 'bg-sky-500/10 text-sky-500',
    group: 'tutor',
  },
  {
    href: '/tutor/classes',
    icon: Users,
    label: '반 관리',
    description: '반 편성·관리',
    activeColor: 'bg-amber-500/10 text-amber-500',
    group: 'tutor',
  },
  {
    href: '/tutor/students',
    icon: User,
    label: '학생 관리',
    description: '학생 등록·관리 (반 없이도 가능)',
    activeColor: 'bg-amber-500/10 text-amber-500',
    group: 'tutor',
  },
  {
    // ★ /tutor/grading mock 제거 (2026-05-12). 실 채점은 /dashboard/grading 으로.
    href: '/dashboard/grading',
    icon: ClipboardCheck,
    label: '채점하기',
    description: 'QR 채점 세션 관리 · 학생 답 자동채점',
    activeColor: 'bg-green-500/10 text-green-500',
    group: 'tutor',
  },
  {
    // 채점 허브로 통합 — 수동 입력은 /dashboard/grading 의 탭. (prescription/entry 라우트도 백워드 호환 유지)
    href: '/dashboard/grading?tab=manual',
    icon: ClipboardCheck,
    label: '수동 채점 입력',
    description: '시험·진단지 채점 결과 수동 입력',
    activeColor: 'bg-amber-500/10 text-amber-500',
    group: 'tutor',
  },
  {
    href: '/dashboard/prescription',
    icon: Stethoscope,
    label: '학생 진단',
    description: '학생별 단원 히트맵·취약점·약점 추적',
    activeColor: 'bg-orange-500/10 text-orange-500',
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
    href: '/dashboard/curation',
    icon: Sparkles,
    label: 'AI 자동 출제',
    description: '자동 맞춤 문제 선정',
    activeColor: 'bg-purple-500/10 text-purple-500',
    group: 'tutor',
  },
  {
    href: '/tutor/analytics',
    icon: BarChart3,
    label: '학생 성적',
    description: '히트맵 및 통계',
    activeColor: 'bg-indigo-500/10 text-indigo-500',
    group: 'tutor',
  },
  {
    href: '/dashboard/reports',
    icon: BarChart3,
    label: '학교별 리포트',
    description: '학교별 시험지 누적 분석 + 학부모 공유 관리',
    activeColor: 'bg-cyan-500/10 text-cyan-400',
    group: 'tutor',
  },
  {
    // ★ 인덱스 [10] — 배열 끝에 append 필수 (topNavGroups 가 인덱스 참조).
    href: '/dashboard/prescription/report',
    icon: Layers,
    label: '진단 종합 리포트',
    description: 'A/B/C 진단 합산 · 시험대비 처방 · 학부모 공유',
    activeColor: 'bg-cyan-500/10 text-cyan-400',
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

export const topNavGroups: NavGroup[] = [
  // ★ 대시보드 단독 메뉴 제거 — 로고 클릭으로 /dashboard 진입 가능
  //   (TopNav.tsx 의 <Link href="/dashboard" ...> 로고 link 가 처리).
  //   사용자 지시 (2026-05-16): "대시보드 굳이 필요없을거 같은데 로고 누르면 대시보드로 가게 하면".
  {
    id: 'repository',
    label: '문제은행',
    icon: FolderOpen,
    children: [
      // ★ tutorNavItems[0] (DB 자산화)는 별도 단독 탭으로 분리 (사용자 요청 — 드롭다운 안 들어가게)
      dashboardNavItems[1], // 시험지저장소
      dashboardNavItems[7], // 과사람클라우드
      dashboardNavItems[6], // 유형/문제관리
      dashboardNavItems[5], // 출판교재유사
    ],
  },
  {
    id: 'materials',
    label: '학원자료',
    icon: BookOpen,
    children: [
      dashboardNavItems[3], // 학원자료
      dashboardNavItems[4], // 도식 갤러리
    ],
  },
  {
    id: 'exams',
    label: '시험지',
    icon: SquarePen,
    children: [
      dashboardNavItems[2], // 시험지출제
      dashboardNavItems[8], // 시험지관리
      tutorNavItems[7],     // AI 자동 출제 (이전 AI 오토큐레이션)
    ],
  },
  {
    id: 'teaching',
    label: '수업관리',
    icon: Users,
    // ★ 채점하기는 별도 [채점] 그룹으로 분리 (2026-05-12).
    children: [
      tutorNavItems[1], // 반 관리
      tutorNavItems[2], // 학생 관리
    ],
  },
  // ★ [채점] — 매일 워크플로우 1급 시민. 학생 답 자동채점·수동 입력 한자리.
  {
    id: 'grading',
    label: '채점',
    icon: ClipboardCheck,
    children: [
      tutorNavItems[3], // 채점하기 (/dashboard/grading)
      tutorNavItems[4], // 수동 채점 입력 (/dashboard/prescription/entry)
    ],
  },
  // ★ [진단] — 학생별 약점 분석·처방. 클리닉 PDF 까지 처방 결과물 묶음.
  {
    id: 'diagnosis',
    label: '진단',
    icon: Stethoscope,
    children: [
      tutorNavItems[5],  // 학생 진단 (/dashboard/prescription)
      tutorNavItems[10], // 진단 종합 리포트 (/dashboard/prescription/report)
      tutorNavItems[6],  // 클리닉시험지
    ],
  },
  // ★ [분석] — 통계·리포트. 학생·학교 단위.
  {
    id: 'analytics',
    label: '분석',
    icon: BarChart3,
    children: [
      tutorNavItems[8], // 학생 성적
      tutorNavItems[9], // 학교별 리포트
    ],
  },
  // ★ DB 자산화 — 단독 탭 (드롭다운 X). 한 번 클릭으로 클라우드 페이지 + 업로드 모달 자동 오픈.
  //   사용자 요청: 다른 메뉴와 분리해서 네비게이션 맨 오른쪽에 즉시 진입 가능하게.
  {
    id: 'db-assetize',
    label: 'DB 자산화',
    icon: Upload,
    href: '/dashboard/cloud?upload=1',
  },
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

// Header 퀵 액션용 (상위 5개)
export const quickNavItems: NavItem[] = [
  dashboardNavItems[0], // 대시보드
  dashboardNavItems[1], // 시험지저장소
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
