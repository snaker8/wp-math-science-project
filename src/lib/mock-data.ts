
export interface SparklineData {
    value: number;
}

export interface StatCardData {
    title: string;
    value: string;
    trend: string;
    trendUp: boolean;
    data: SparklineData[];
}

export interface HeatmapCell {
    student: string;
    unit: string;
    score: number; // 0-100
}

export interface ActivityLog {
    id: string;
    title: string;
    description: string;
    time: string;
    type: 'grading' | 'clinic' | 'system';
}

export interface ClassStatus {
    id: string;
    name: string;
    time: string;
    students: number;
    status: 'active' | 'scheduled' | 'finished';
}

// 1. Stats Data with Sparkline points
export const statsData: StatCardData[] = [
    {
        title: '총 수강생',
        value: '1,248',
        trend: '+12%',
        trendUp: true,
        data: Array.from({ length: 20 }, () => ({ value: 40 + Math.random() * 60 })),
    },
    {
        title: '활성 학습지',
        value: '856',
        trend: '+5.4%',
        trendUp: true,
        data: Array.from({ length: 20 }, () => ({ value: 30 + Math.random() * 70 })),
    },
    {
        title: '평균 성취도',
        value: '78.4점',
        trend: '-2.1%',
        trendUp: false,
        data: Array.from({ length: 20 }, () => ({ value: 60 + Math.random() * 40 })),
    },
];

// 2. Heatmap Data (10 students x 10 units)
export const heatmapData: HeatmapCell[] = [];
const students = ['김민수', '이서준', '박지윤', '최서연', '정현우', '강하은', '조민재', '윤서아', '임도현', '한예린'];
const units = ['다항식', '방정식', '부등식', '함수', '삼각함수', '수열', '지수로그', '극한', '미분', '적분'];

students.forEach((student) => {
    units.forEach((unit) => {
        // Generate clearer patterns for demo purposes
        // Some students are generally good, some struggle with specific units (e.g., Calculus)
        let baseScore = Math.random() * 40 + 60; // 60-100 base
        if (unit === '미분' || unit === '적분') baseScore -= 15; // Harder units
        if (student === '김민수') baseScore += 10; // Top student

        heatmapData.push({
            student,
            unit,
            score: Math.min(100, Math.max(0, Math.round(baseScore))),
        });
    });
});

// 3. Activity Logs
export const activityLogs: ActivityLog[] = [
    { id: '1', title: '채점 완료', description: '고2 심화반 모의고사 채점이 완료되었습니다.', time: '방금 전', type: 'grading' },
    { id: '2', title: '클리닉 생성', description: '김철수 학생을 위한 미분 집중 클리닉이 생성되었습니다.', time: '15분 전', type: 'clinic' },
    { id: '3', title: '시스템 업데이트', description: '새로운 AI 문제 추천 알고리즘이 적용되었습니다.', time: '2시간 전', type: 'system' },
    { id: '4', title: '과제 제출', description: '중3 기하반 12명이 과제를 제출했습니다.', time: '3시간 전', type: 'grading' },
    { id: '5', title: '상담 예약', description: '이영희 학부모님 상담 예약이 확정되었습니다.', time: '5시간 전', type: 'system' },
];

// 4. Class Status
export const classStatus: ClassStatus[] = [
    { id: 'c1', name: '고2 수I 심화', time: '14:00 - 16:00', students: 12, status: 'active' },
    { id: 'c2', name: '중3 기하 특강', time: '16:30 - 18:00', students: 8, status: 'scheduled' },
    { id: 'c3', name: '고3 미적분 실전', time: '19:00 - 22:00', students: 24, status: 'scheduled' },
    { id: 'c4', name: '수II 기초반', time: '10:00 - 12:00', students: 6, status: 'finished' },
];

// 5. Report Specific Data
export interface ReportCompetency {
    subject: string;
    value: number;
    fullMark: number;
}

export interface GrowthData {
    month: string;
    studentScore: number;
    averageScore: number;
}

export interface TopicMastery {
    topic: string;
    progress: number; // 0-100
    status: 'mastered' | 'improving' | 'critical';
}

export const competencyData: ReportCompetency[] = [
    { subject: '이해력', value: 85, fullMark: 100 },
    { subject: '계산력', value: 70, fullMark: 100 },
    { subject: '추론력', value: 90, fullMark: 100 },
    { subject: '문제해결력', value: 75, fullMark: 100 },
    { subject: '응용력', value: 80, fullMark: 100 },
];

export const growthTrendData: GrowthData[] = [
    { month: '9월', studentScore: 65, averageScore: 70 },
    { month: '10월', studentScore: 72, averageScore: 71 },
    { month: '11월', studentScore: 70, averageScore: 72 },
    { month: '12월', studentScore: 78, averageScore: 73 },
    { month: '1월', studentScore: 85, averageScore: 74 },
    { month: '2월', studentScore: 88, averageScore: 75 },
];

export const topicMasteryData: TopicMastery[] = [
    { topic: '다항식', progress: 95, status: 'mastered' },
    { topic: '방정식', progress: 88, status: 'mastered' },
    { topic: '부등식', progress: 75, status: 'improving' },
    { topic: '함수', progress: 92, status: 'mastered' },
    { topic: '지수로그', progress: 60, status: 'improving' },
    { topic: '삼각함수', progress: 45, status: 'critical' },
];

export const aiInsights = {
    summary: "김민수 학생은 전반적인 수학적 사고력과 추론 능력이 매우 뛰어납니다.",
    details: [
        "함수의 그래프 해석 및 기하학적 접근 방식에서는 고등 수준의 통찰력을 보여주고 있습니다.",
        "다만, 복합 연산 과정에서의 사소한 실수로 인해 계산력 점수가 다소 낮게 측정되는 경향이 있습니다.",
        "심화 수준의 문제 해결 능력은 평균 이상이나, 문장제 문제의 핵심 조건을 모델링하는 속도를 높이는 훈련이 필요합니다."
    ],
    recommendation: "삼각함수 단원의 기초 개념 재정립과 고난도 연산 시뮬레이션을 통한 정확도 향상에 집중할 예정입니다."
};

export const heatmapConfig = {
    students,
    units,
};

export interface AttitudeMetric {
    category: string;
    score: number; // 0-100
    prevScore: number;
    trend: 'up' | 'down' | 'stable';
}

export const attitudeData = {
    totalScore: 88,
    metrics: [
        { category: '출결 점수', score: 100, prevScore: 100, trend: 'stable' },
        { category: '과제 이행률', score: 92, prevScore: 85, trend: 'up' },
        { category: '수업 집중도', score: 85, prevScore: 80, trend: 'up' },
        { category: '질문 빈도', score: 75, prevScore: 60, trend: 'up' },
    ] as AttitudeMetric[],
    comment: "지난달보다 질문 빈도가 20% 상승하여 자기주도 학습 태도가 눈에 띄게 개선되었습니다. 과제 이행률 또한 꾸준히 우수한 수준을 유지하고 있습니다."
};

export interface Teacher {
    id: string;
    name: string;
    role: 'Director' | 'Tutor' | 'Staff';
    status: 'Active' | 'Inactive';
    email: string;
    lastActive: string;
}

export const teacherList: Teacher[] = [
    { id: 't1', name: '박지성', role: 'Director', status: 'Active', email: 'director@litecore.com', lastActive: 'Now' },
    { id: 't2', name: '김연아', role: 'Tutor', status: 'Active', email: 'yuna@litecore.com', lastActive: '2m ago' },
    { id: 't3', name: '이강인', role: 'Tutor', status: 'Inactive', email: 'kangin@litecore.com', lastActive: '1d ago' },
    { id: 't4', name: '손흥민', role: 'Staff', status: 'Active', email: 'son@litecore.com', lastActive: '1h ago' },
];

export const systemLogs = [
    { time: '10:00', status: 98, latency: 12 },
    { time: '10:05', status: 98, latency: 15 },
    { time: '10:10', status: 97, latency: 13 },
    { time: '10:15', status: 99, latency: 11 },
    { time: '10:20', status: 99, latency: 12 },
    { time: '10:25', status: 98, latency: 45 },
    { time: '10:30', status: 99, latency: 12 },
    { time: '10:35', status: 99, latency: 11 },
];

// 6. Detailed Staff Data for Admin Dashboard
export interface StaffPermission {
    id: string;
    label: string;
    description: string;
    enabled: boolean;
}

export interface StaffMember {
    id: string;
    name: string;
    role: 'Director' | 'Manager' | 'Tutor';
    email: string;
    phone: string;
    avatar: string; // Color code or simple text
    assignedClasses: string[];
    status: 'Active' | 'Inactive' | 'Away';
    lastActive: string;
    joinedDate: string;
    permissions: {
        examCreation: boolean;
        reportSending: boolean;
        payment: boolean;
        system: boolean;
    };
    activityScore: number; // 0-100 for activity sparkline
}

export const mockStaff: StaffMember[] = [
    {
        id: 's1',
        name: '박지성',
        role: 'Director',
        email: 'director@gwamath.com',
        phone: '010-1234-5678',
        avatar: 'bg-indigo-500',
        assignedClasses: ['의대반 A', '서울대반 B'],
        status: 'Active',
        lastActive: '방금 전',
        joinedDate: '2023.01.15',
        permissions: { examCreation: true, reportSending: true, payment: true, system: true },
        activityScore: 98
    },
    {
        id: 's2',
        name: '김연아',
        role: 'Manager',
        email: 'yuna@gwamath.com',
        phone: '010-2345-6789',
        avatar: 'bg-rose-500',
        assignedClasses: ['고2 심화반', '중3 영재반'],
        status: 'Active',
        lastActive: '10분 전',
        joinedDate: '2023.03.10',
        permissions: { examCreation: true, reportSending: true, payment: false, system: true },
        activityScore: 85
    },
    {
        id: 's3',
        name: '손흥민',
        role: 'Tutor',
        email: 'son@gwamath.com',
        phone: '010-3456-7890',
        avatar: 'bg-emerald-500',
        assignedClasses: ['고1 정규반'],
        status: 'Away',
        lastActive: '1시간 전',
        joinedDate: '2023.05.20',
        permissions: { examCreation: true, reportSending: true, payment: false, system: false },
        activityScore: 72
    },
    {
        id: 's4',
        name: '이강인',
        role: 'Tutor',
        email: 'kangin@gwamath.com',
        phone: '010-4567-8901',
        avatar: 'bg-amber-500',
        assignedClasses: [],
        status: 'Inactive',
        lastActive: '2일 전',
        joinedDate: '2023.08.01',
        permissions: { examCreation: false, reportSending: false, payment: false, system: false },
        activityScore: 10
    },
    {
        id: 's5',
        name: '황희찬',
        role: 'Tutor',
        email: 'hwang@gwamath.com',
        phone: '010-5678-9012',
        avatar: 'bg-cyan-500',
        assignedClasses: ['중2 심화반'],
        status: 'Active',
        lastActive: '5분 전',
        joinedDate: '2023.11.15',
        permissions: { examCreation: true, reportSending: false, payment: false, system: false },
        activityScore: 65
    }
];

// 7. Student History Timeline Data
export interface HistoryEvent {
    id: string;
    date: string;
    examName: string;
    score: number;
    badge: 'Mastered' | 'Passing' | 'Review Needed';
    weakness: string[];
    aiComment: string;
}

export const mockHistoryTimeline: HistoryEvent[] = [
    {
        id: 'h1',
        date: '2024.02.15',
        examName: '2월 월간 성취도 평가',
        score: 92,
        badge: 'Mastered',
        weakness: ['복합 삼각함수 연산'],
        aiComment: '전반적으로 훌륭하나, 삼각함수 변환 과정에서 사소한 실수가 감지되었습니다. 개념 이해도는 완벽합니다.'
    },
    {
        id: 'h2',
        date: '2024.02.01',
        examName: '수I 단원평가: 삼각함수',
        score: 78,
        badge: 'Passing',
        weakness: ['사인법칙', '코사인법칙 응용'],
        aiComment: '도형과 결합된 문제에서 식을 세우는 속도가 다소 느립니다. 예제 풀이를 통해 패턴 학습이 필요합니다.'
    },
    {
        id: 'h3',
        date: '2024.01.15',
        examName: '1월 월간 성취도 평가',
        score: 85,
        badge: 'Mastered',
        weakness: ['지수함수의 그래프'],
        aiComment: '지난달 대비 계산 실수가 검출되지 않았습니다. 매우 안정적인 성장을 보이고 있습니다.'
    },
    {
        id: 'h4',
        date: '2024.01.05',
        examName: '수I 단원평가: 지수와 로그',
        score: 65,
        badge: 'Review Needed',
        weakness: ['로그의 성질', '상용로그'],
        aiComment: '기본적인 로그 연산 규칙에서 혼동이 보입니다. 기초 연산 트레이닝이 시급합니다.'
    },
    {
        id: 'h5',
        date: '2023.12.20',
        examName: '겨울방학 진단평가',
        score: 70,
        badge: 'Passing',
        weakness: ['수열의 극한'],
        aiComment: '선행 학습 단계임에도 불구하고 평균 이상의 이해도를 보여주었습니다.'
    }
];

export const mockStudentProfile = {
    name: '김민수',
    grade: '고등학교 2학년',
    school: '서울과학고등학교',
    totalLearningTime: '342시간 20분',
    avatar: 'bg-indigo-500' // reused style
};
