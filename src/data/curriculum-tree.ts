// ============================================================================
// 대한민국 수학 교육과정 커리큘럼 트리 (2015 개정 교육과정 기준)
// 초등 1~6학년 | 중학교 1~3학년 | 고등학교 과목별
// ============================================================================

export interface CurriculumUnit {
  id: string;
  name: string;        // 소단원명
}

export interface CurriculumChapter {
  id: string;
  name: string;        // 대단원명
  units: CurriculumUnit[];
}

export interface CurriculumSemester {
  id: string;
  label: string;       // '1학기' | '2학기' | '' (고등은 학기 구분 없음)
  chapters: CurriculumChapter[];
}

export interface CurriculumGrade {
  id: string;          // 'ES1', 'ES2', ..., 'MS1', ..., 'HS_MATH'
  label: string;       // '초등 1학년', '중학교 2학년', '수학 I' ...
  schoolLevel: '초등학교' | '중학교' | '고등학교';
  semesters: CurriculumSemester[];
}

// ============================================================================
// 초등학교 (Elementary School, 초1 ~ 초6)
// 2015 개정 교육과정 기준 단원 구성
// ============================================================================

const elementaryGrades: CurriculumGrade[] = [
  {
    id: 'ES1',
    label: '초등 1학년',
    schoolLevel: '초등학교',
    semesters: [
      {
        id: 'ES1-1',
        label: '1학기',
        chapters: [
          { id: 'ES1-1-1', name: '9까지의 수', units: [
            { id: 'ES1-1-1-1', name: '수의 순서와 크기' },
            { id: 'ES1-1-1-2', name: '수 읽기와 쓰기' },
          ]},
          { id: 'ES1-1-2', name: '여러 가지 모양', units: [
            { id: 'ES1-1-2-1', name: '입체도형의 모양' },
            { id: 'ES1-1-2-2', name: '평면도형의 모양' },
          ]},
          { id: 'ES1-1-3', name: '덧셈과 뺄셈', units: [
            { id: 'ES1-1-3-1', name: '덧셈하기' },
            { id: 'ES1-1-3-2', name: '뺄셈하기' },
          ]},
          { id: 'ES1-1-4', name: '비교하기', units: [
            { id: 'ES1-1-4-1', name: '길이 비교하기' },
            { id: 'ES1-1-4-2', name: '무게·넓이·들이 비교하기' },
          ]},
          { id: 'ES1-1-5', name: '50까지의 수', units: [
            { id: 'ES1-1-5-1', name: '10 알아보기' },
            { id: 'ES1-1-5-2', name: '50까지의 수' },
          ]},
        ],
      },
      {
        id: 'ES1-2',
        label: '2학기',
        chapters: [
          { id: 'ES1-2-1', name: '100까지의 수', units: [
            { id: 'ES1-2-1-1', name: '60부터 99까지의 수' },
            { id: 'ES1-2-1-2', name: '수의 순서와 크기 비교' },
          ]},
          { id: 'ES1-2-2', name: '덧셈과 뺄셈(2)', units: [
            { id: 'ES1-2-2-1', name: '받아올림·받아내림 없는 덧뺄셈' },
            { id: 'ES1-2-2-2', name: '세 수의 덧셈과 뺄셈' },
          ]},
          { id: 'ES1-2-3', name: '여러 가지 모양(2)', units: [
            { id: 'ES1-2-3-1', name: '모양 만들기' },
          ]},
          { id: 'ES1-2-4', name: '시계 보기와 규칙 찾기', units: [
            { id: 'ES1-2-4-1', name: '몇 시 알아보기' },
            { id: 'ES1-2-4-2', name: '규칙 찾기' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'ES2',
    label: '초등 2학년',
    schoolLevel: '초등학교',
    semesters: [
      {
        id: 'ES2-1',
        label: '1학기',
        chapters: [
          { id: 'ES2-1-1', name: '세 자리 수', units: [
            { id: 'ES2-1-1-1', name: '백(100) 알아보기' },
            { id: 'ES2-1-1-2', name: '세 자리 수 읽기·쓰기' },
            { id: 'ES2-1-1-3', name: '뛰어 세기, 수의 크기 비교' },
          ]},
          { id: 'ES2-1-2', name: '여러 가지 도형', units: [
            { id: 'ES2-1-2-1', name: '삼각형·사각형·원' },
            { id: 'ES2-1-2-2', name: '칠교판 놀이' },
          ]},
          { id: 'ES2-1-3', name: '덧셈과 뺄셈', units: [
            { id: 'ES2-1-3-1', name: '받아올림이 있는 덧셈' },
            { id: 'ES2-1-3-2', name: '받아내림이 있는 뺄셈' },
          ]},
          { id: 'ES2-1-4', name: '길이 재기', units: [
            { id: 'ES2-1-4-1', name: '1cm 알아보기' },
            { id: 'ES2-1-4-2', name: '자로 길이 재기' },
          ]},
          { id: 'ES2-1-5', name: '분류하기', units: [
            { id: 'ES2-1-5-1', name: '분류 기준 정하기' },
          ]},
          { id: 'ES2-1-6', name: '곱셈', units: [
            { id: 'ES2-1-6-1', name: '묶어 세기' },
            { id: 'ES2-1-6-2', name: '곱셈식 알아보기' },
          ]},
        ],
      },
      {
        id: 'ES2-2',
        label: '2학기',
        chapters: [
          { id: 'ES2-2-1', name: '네 자리 수', units: [
            { id: 'ES2-2-1-1', name: '천(1000) 알아보기' },
            { id: 'ES2-2-1-2', name: '네 자리 수의 크기 비교' },
          ]},
          { id: 'ES2-2-2', name: '곱셈구구', units: [
            { id: 'ES2-2-2-1', name: '2~5단 곱셈구구' },
            { id: 'ES2-2-2-2', name: '6~9단 곱셈구구' },
          ]},
          { id: 'ES2-2-3', name: '길이 재기(2)', units: [
            { id: 'ES2-2-3-1', name: '1m 알아보기' },
            { id: 'ES2-2-3-2', name: '길이의 합과 차' },
          ]},
          { id: 'ES2-2-4', name: '시각과 시간', units: [
            { id: 'ES2-2-4-1', name: '몇 시 몇 분 알아보기' },
            { id: 'ES2-2-4-2', name: '1시간, 하루, 1주, 1달' },
          ]},
          { id: 'ES2-2-5', name: '표와 그래프', units: [
            { id: 'ES2-2-5-1', name: '표 만들기' },
            { id: 'ES2-2-5-2', name: '그래프로 나타내기' },
          ]},
          { id: 'ES2-2-6', name: '규칙 찾기', units: [
            { id: 'ES2-2-6-1', name: '규칙 찾기와 규칙 만들기' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'ES3',
    label: '초등 3학년',
    schoolLevel: '초등학교',
    semesters: [
      {
        id: 'ES3-1',
        label: '1학기',
        chapters: [
          { id: 'ES3-1-1', name: '덧셈과 뺄셈', units: [
            { id: 'ES3-1-1-1', name: '세 자리 수의 덧셈' },
            { id: 'ES3-1-1-2', name: '세 자리 수의 뺄셈' },
          ]},
          { id: 'ES3-1-2', name: '평면도형', units: [
            { id: 'ES3-1-2-1', name: '선분·직선·반직선·각' },
            { id: 'ES3-1-2-2', name: '직각삼각형·직사각형·정사각형' },
          ]},
          { id: 'ES3-1-3', name: '나눗셈', units: [
            { id: 'ES3-1-3-1', name: '나눗셈의 의미' },
            { id: 'ES3-1-3-2', name: '나눗셈과 곱셈의 관계' },
          ]},
          { id: 'ES3-1-4', name: '곱셈', units: [
            { id: 'ES3-1-4-1', name: '(몇십)×(몇), (몇)×(몇십)' },
            { id: 'ES3-1-4-2', name: '(두·세 자리)×(한 자리)' },
          ]},
          { id: 'ES3-1-5', name: '길이와 시간', units: [
            { id: 'ES3-1-5-1', name: 'mm, km 단위' },
            { id: 'ES3-1-5-2', name: '초 단위와 시간 계산' },
          ]},
          { id: 'ES3-1-6', name: '분수와 소수', units: [
            { id: 'ES3-1-6-1', name: '분수의 기초' },
            { id: 'ES3-1-6-2', name: '소수의 기초' },
          ]},
        ],
      },
      {
        id: 'ES3-2',
        label: '2학기',
        chapters: [
          { id: 'ES3-2-1', name: '곱셈', units: [
            { id: 'ES3-2-1-1', name: '(세 자리)×(한 자리)' },
            { id: 'ES3-2-1-2', name: '(두 자리)×(두 자리)' },
          ]},
          { id: 'ES3-2-2', name: '나눗셈', units: [
            { id: 'ES3-2-2-1', name: '(두 자리)÷(한 자리)' },
            { id: 'ES3-2-2-2', name: '나머지가 있는 나눗셈' },
          ]},
          { id: 'ES3-2-3', name: '원', units: [
            { id: 'ES3-2-3-1', name: '원의 중심·반지름·지름' },
          ]},
          { id: 'ES3-2-4', name: '분수', units: [
            { id: 'ES3-2-4-1', name: '분수의 종류' },
            { id: 'ES3-2-4-2', name: '분수의 크기 비교' },
          ]},
          { id: 'ES3-2-5', name: '들이와 무게', units: [
            { id: 'ES3-2-5-1', name: 'L, mL 단위' },
            { id: 'ES3-2-5-2', name: 'kg, g 단위' },
          ]},
          { id: 'ES3-2-6', name: '자료의 정리', units: [
            { id: 'ES3-2-6-1', name: '그림그래프' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'ES4',
    label: '초등 4학년',
    schoolLevel: '초등학교',
    semesters: [
      {
        id: 'ES4-1',
        label: '1학기',
        chapters: [
          { id: 'ES4-1-1', name: '큰 수', units: [
            { id: 'ES4-1-1-1', name: '만, 억, 조' },
            { id: 'ES4-1-1-2', name: '큰 수의 크기 비교' },
          ]},
          { id: 'ES4-1-2', name: '각도', units: [
            { id: 'ES4-1-2-1', name: '각도 재기' },
            { id: 'ES4-1-2-2', name: '삼각형·사각형의 각도' },
          ]},
          { id: 'ES4-1-3', name: '곱셈과 나눗셈', units: [
            { id: 'ES4-1-3-1', name: '(세 자리)×(두 자리)' },
            { id: 'ES4-1-3-2', name: '(두·세 자리)÷(두 자리)' },
          ]},
          { id: 'ES4-1-4', name: '평면도형의 이동', units: [
            { id: 'ES4-1-4-1', name: '밀기·뒤집기·돌리기' },
          ]},
          { id: 'ES4-1-5', name: '막대그래프', units: [
            { id: 'ES4-1-5-1', name: '막대그래프 읽기·그리기' },
          ]},
          { id: 'ES4-1-6', name: '규칙 찾기', units: [
            { id: 'ES4-1-6-1', name: '수 배열에서 규칙 찾기' },
          ]},
        ],
      },
      {
        id: 'ES4-2',
        label: '2학기',
        chapters: [
          { id: 'ES4-2-1', name: '분수의 덧셈과 뺄셈', units: [
            { id: 'ES4-2-1-1', name: '동분모 분수의 덧셈과 뺄셈' },
          ]},
          { id: 'ES4-2-2', name: '삼각형', units: [
            { id: 'ES4-2-2-1', name: '이등변삼각형·정삼각형' },
            { id: 'ES4-2-2-2', name: '예각·둔각삼각형' },
          ]},
          { id: 'ES4-2-3', name: '소수의 덧셈과 뺄셈', units: [
            { id: 'ES4-2-3-1', name: '소수 두 자리, 세 자리' },
            { id: 'ES4-2-3-2', name: '소수의 덧셈과 뺄셈' },
          ]},
          { id: 'ES4-2-4', name: '사각형', units: [
            { id: 'ES4-2-4-1', name: '수직과 평행' },
            { id: 'ES4-2-4-2', name: '사다리꼴·평행사변형·마름모' },
          ]},
          { id: 'ES4-2-5', name: '꺾은선그래프', units: [
            { id: 'ES4-2-5-1', name: '꺾은선그래프 읽기·그리기' },
          ]},
          { id: 'ES4-2-6', name: '다각형', units: [
            { id: 'ES4-2-6-1', name: '다각형·정다각형·대각선' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'ES5',
    label: '초등 5학년',
    schoolLevel: '초등학교',
    semesters: [
      {
        id: 'ES5-1',
        label: '1학기',
        chapters: [
          { id: 'ES5-1-1', name: '자연수의 혼합 계산', units: [
            { id: 'ES5-1-1-1', name: '덧뺄셈, 곱나눗셈 혼합 계산' },
          ]},
          { id: 'ES5-1-2', name: '약수와 배수', units: [
            { id: 'ES5-1-2-1', name: '약수와 배수' },
            { id: 'ES5-1-2-2', name: '공약수와 최대공약수' },
            { id: 'ES5-1-2-3', name: '공배수와 최소공배수' },
          ]},
          { id: 'ES5-1-3', name: '약분과 통분', units: [
            { id: 'ES5-1-3-1', name: '크기가 같은 분수' },
            { id: 'ES5-1-3-2', name: '약분과 기약분수' },
            { id: 'ES5-1-3-3', name: '통분과 분수의 크기 비교' },
          ]},
          { id: 'ES5-1-4', name: '분수의 덧셈과 뺄셈', units: [
            { id: 'ES5-1-4-1', name: '이분모 분수의 덧뺄셈' },
          ]},
          { id: 'ES5-1-5', name: '다각형의 둘레와 넓이', units: [
            { id: 'ES5-1-5-1', name: '정다각형의 둘레' },
            { id: 'ES5-1-5-2', name: '직사각형·평행사변형·삼각형 넓이' },
            { id: 'ES5-1-5-3', name: '마름모·사다리꼴 넓이' },
          ]},
        ],
      },
      {
        id: 'ES5-2',
        label: '2학기',
        chapters: [
          { id: 'ES5-2-1', name: '수의 범위와 어림', units: [
            { id: 'ES5-2-1-1', name: '이상·이하·초과·미만' },
            { id: 'ES5-2-1-2', name: '올림·버림·반올림' },
          ]},
          { id: 'ES5-2-2', name: '분수의 곱셈', units: [
            { id: 'ES5-2-2-1', name: '(분수)×(자연수)' },
            { id: 'ES5-2-2-2', name: '(분수)×(분수)' },
          ]},
          { id: 'ES5-2-3', name: '합동과 대칭', units: [
            { id: 'ES5-2-3-1', name: '도형의 합동' },
            { id: 'ES5-2-3-2', name: '선대칭·점대칭 도형' },
          ]},
          { id: 'ES5-2-4', name: '소수의 곱셈', units: [
            { id: 'ES5-2-4-1', name: '(소수)×(자연수)' },
            { id: 'ES5-2-4-2', name: '(소수)×(소수)' },
          ]},
          { id: 'ES5-2-5', name: '직육면체', units: [
            { id: 'ES5-2-5-1', name: '직육면체와 정육면체' },
            { id: 'ES5-2-5-2', name: '직육면체의 겨냥도와 전개도' },
          ]},
          { id: 'ES5-2-6', name: '평균과 가능성', units: [
            { id: 'ES5-2-6-1', name: '평균' },
            { id: 'ES5-2-6-2', name: '일이 일어날 가능성' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'ES6',
    label: '초등 6학년',
    schoolLevel: '초등학교',
    semesters: [
      {
        id: 'ES6-1',
        label: '1학기',
        chapters: [
          { id: 'ES6-1-1', name: '분수의 나눗셈', units: [
            { id: 'ES6-1-1-1', name: '(자연수)÷(자연수)' },
            { id: 'ES6-1-1-2', name: '(분수)÷(자연수)' },
          ]},
          { id: 'ES6-1-2', name: '각기둥과 각뿔', units: [
            { id: 'ES6-1-2-1', name: '각기둥' },
            { id: 'ES6-1-2-2', name: '각뿔' },
          ]},
          { id: 'ES6-1-3', name: '소수의 나눗셈', units: [
            { id: 'ES6-1-3-1', name: '(소수)÷(자연수)' },
            { id: 'ES6-1-3-2', name: '(자연수)÷(소수)' },
            { id: 'ES6-1-3-3', name: '(소수)÷(소수)' },
          ]},
          { id: 'ES6-1-4', name: '비와 비율', units: [
            { id: 'ES6-1-4-1', name: '비와 비율' },
            { id: 'ES6-1-4-2', name: '백분율과 활용' },
          ]},
          { id: 'ES6-1-5', name: '여러 가지 그래프', units: [
            { id: 'ES6-1-5-1', name: '원그래프' },
            { id: 'ES6-1-5-2', name: '띠그래프' },
          ]},
          { id: 'ES6-1-6', name: '직육면체의 겉넓이와 부피', units: [
            { id: 'ES6-1-6-1', name: '직육면체의 겉넓이' },
            { id: 'ES6-1-6-2', name: '직육면체의 부피' },
          ]},
        ],
      },
      {
        id: 'ES6-2',
        label: '2학기',
        chapters: [
          { id: 'ES6-2-1', name: '분수의 나눗셈(2)', units: [
            { id: 'ES6-2-1-1', name: '(분수)÷(분수)' },
          ]},
          { id: 'ES6-2-2', name: '소수의 나눗셈(2)', units: [
            { id: 'ES6-2-2-1', name: '(소수)÷(소수)' },
          ]},
          { id: 'ES6-2-3', name: '공간과 입체', units: [
            { id: 'ES6-2-3-1', name: '쌓기나무' },
            { id: 'ES6-2-3-2', name: '여러 방향에서 본 모양' },
          ]},
          { id: 'ES6-2-4', name: '비례식과 비례배분', units: [
            { id: 'ES6-2-4-1', name: '비례식' },
            { id: 'ES6-2-4-2', name: '비례배분' },
          ]},
          { id: 'ES6-2-5', name: '원의 넓이', units: [
            { id: 'ES6-2-5-1', name: '원주율' },
            { id: 'ES6-2-5-2', name: '원의 넓이' },
          ]},
          { id: 'ES6-2-6', name: '원기둥·원뿔·구', units: [
            { id: 'ES6-2-6-1', name: '원기둥과 원기둥의 전개도' },
            { id: 'ES6-2-6-2', name: '원뿔과 구' },
          ]},
        ],
      },
    ],
  },
];

// ============================================================================
// 중학교 (Middle School, 중1 ~ 중3)
// 2015 개정 교육과정 기준 학기별 단원 구성
// ============================================================================

const middleGrades: CurriculumGrade[] = [
  {
    id: 'MS1',
    label: '중학교 1학년',
    schoolLevel: '중학교',
    semesters: [
      {
        id: 'MS1-1',
        label: '1학기',
        chapters: [
          { id: 'MS1-1-1', name: '소인수분해', units: [
            { id: 'MS1-1-1-1', name: '소수와 합성수' },
            { id: 'MS1-1-1-2', name: '소인수분해' },
            { id: 'MS1-1-1-3', name: '최대공약수와 최소공배수' },
          ]},
          { id: 'MS1-1-2', name: '정수와 유리수', units: [
            { id: 'MS1-1-2-1', name: '정수와 유리수' },
            { id: 'MS1-1-2-2', name: '유리수의 덧셈과 뺄셈' },
            { id: 'MS1-1-2-3', name: '유리수의 곱셈과 나눗셈' },
          ]},
          { id: 'MS1-1-3', name: '문자와 식', units: [
            { id: 'MS1-1-3-1', name: '문자의 사용과 식의 값' },
            { id: 'MS1-1-3-2', name: '일차식의 계산' },
          ]},
          { id: 'MS1-1-4', name: '일차방정식', units: [
            { id: 'MS1-1-4-1', name: '방정식의 뜻' },
            { id: 'MS1-1-4-2', name: '일차방정식의 풀이' },
            { id: 'MS1-1-4-3', name: '일차방정식의 활용' },
          ]},
        ],
      },
      {
        id: 'MS1-2',
        label: '2학기',
        chapters: [
          { id: 'MS1-2-1', name: '좌표평면과 그래프', units: [
            { id: 'MS1-2-1-1', name: '순서쌍과 좌표' },
            { id: 'MS1-2-1-2', name: '그래프' },
            { id: 'MS1-2-1-3', name: '정비례와 반비례' },
          ]},
          { id: 'MS1-2-2', name: '기본 도형', units: [
            { id: 'MS1-2-2-1', name: '점·선·면·각' },
            { id: 'MS1-2-2-2', name: '위치 관계' },
            { id: 'MS1-2-2-3', name: '평행선의 성질' },
          ]},
          { id: 'MS1-2-3', name: '작도와 합동', units: [
            { id: 'MS1-2-3-1', name: '작도' },
            { id: 'MS1-2-3-2', name: '삼각형의 합동' },
          ]},
          { id: 'MS1-2-4', name: '평면도형', units: [
            { id: 'MS1-2-4-1', name: '다각형' },
            { id: 'MS1-2-4-2', name: '원과 부채꼴' },
          ]},
          { id: 'MS1-2-5', name: '입체도형', units: [
            { id: 'MS1-2-5-1', name: '다면체' },
            { id: 'MS1-2-5-2', name: '회전체' },
            { id: 'MS1-2-5-3', name: '입체도형의 겉넓이와 부피' },
          ]},
          { id: 'MS1-2-6', name: '자료의 정리와 해석', units: [
            { id: 'MS1-2-6-1', name: '줄기와 잎 그림, 도수분포표' },
            { id: 'MS1-2-6-2', name: '히스토그램과 상대도수' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'MS2',
    label: '중학교 2학년',
    schoolLevel: '중학교',
    semesters: [
      {
        id: 'MS2-1',
        label: '1학기',
        chapters: [
          { id: 'MS2-1-1', name: '유리수와 순환소수', units: [
            { id: 'MS2-1-1-1', name: '유한소수와 무한소수' },
            { id: 'MS2-1-1-2', name: '순환소수의 분수 표현' },
          ]},
          { id: 'MS2-1-2', name: '식의 계산', units: [
            { id: 'MS2-1-2-1', name: '지수법칙' },
            { id: 'MS2-1-2-2', name: '단항식의 곱셈과 나눗셈' },
            { id: 'MS2-1-2-3', name: '다항식의 덧셈과 뺄셈' },
          ]},
          { id: 'MS2-1-3', name: '일차부등식', units: [
            { id: 'MS2-1-3-1', name: '부등식의 성질' },
            { id: 'MS2-1-3-2', name: '일차부등식의 풀이' },
            { id: 'MS2-1-3-3', name: '연립부등식의 활용' },
          ]},
          { id: 'MS2-1-4', name: '연립방정식', units: [
            { id: 'MS2-1-4-1', name: '연립방정식의 뜻' },
            { id: 'MS2-1-4-2', name: '가감법과 대입법' },
            { id: 'MS2-1-4-3', name: '연립방정식의 활용' },
          ]},
        ],
      },
      {
        id: 'MS2-2',
        label: '2학기',
        chapters: [
          { id: 'MS2-2-1', name: '일차함수와 그래프', units: [
            { id: 'MS2-2-1-1', name: '함수와 함수값' },
            { id: 'MS2-2-1-2', name: '일차함수의 그래프' },
            { id: 'MS2-2-1-3', name: '일차함수와 일차방정식의 관계' },
          ]},
          { id: 'MS2-2-2', name: '삼각형의 성질', units: [
            { id: 'MS2-2-2-1', name: '이등변삼각형의 성질' },
            { id: 'MS2-2-2-2', name: '삼각형의 외심과 내심' },
          ]},
          { id: 'MS2-2-3', name: '사각형의 성질', units: [
            { id: 'MS2-2-3-1', name: '평행사변형의 성질' },
            { id: 'MS2-2-3-2', name: '여러 가지 사각형' },
          ]},
          { id: 'MS2-2-4', name: '도형의 닮음', units: [
            { id: 'MS2-2-4-1', name: '닮음의 뜻과 성질' },
            { id: 'MS2-2-4-2', name: '삼각형의 닮음 조건' },
            { id: 'MS2-2-4-3', name: '닮음의 활용(평행선, 무게중심)' },
          ]},
          { id: 'MS2-2-5', name: '확률', units: [
            { id: 'MS2-2-5-1', name: '경우의 수' },
            { id: 'MS2-2-5-2', name: '확률의 뜻과 성질' },
            { id: 'MS2-2-5-3', name: '확률의 계산' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'MS3',
    label: '중학교 3학년',
    schoolLevel: '중학교',
    semesters: [
      {
        id: 'MS3-1',
        label: '1학기',
        chapters: [
          { id: 'MS3-1-1', name: '제곱근과 실수', units: [
            { id: 'MS3-1-1-1', name: '제곱근의 뜻과 성질' },
            { id: 'MS3-1-1-2', name: '무리수와 실수' },
            { id: 'MS3-1-1-3', name: '근호를 포함한 식의 계산' },
          ]},
          { id: 'MS3-1-2', name: '다항식의 곱셈과 인수분해', units: [
            { id: 'MS3-1-2-1', name: '곱셈 공식' },
            { id: 'MS3-1-2-2', name: '인수분해 공식' },
          ]},
          { id: 'MS3-1-3', name: '이차방정식', units: [
            { id: 'MS3-1-3-1', name: '이차방정식의 풀이' },
            { id: 'MS3-1-3-2', name: '근의 공식' },
            { id: 'MS3-1-3-3', name: '이차방정식의 활용' },
          ]},
          { id: 'MS3-1-4', name: '이차함수', units: [
            { id: 'MS3-1-4-1', name: '이차함수와 그 그래프' },
            { id: 'MS3-1-4-2', name: '이차함수의 최댓값·최솟값' },
          ]},
        ],
      },
      {
        id: 'MS3-2',
        label: '2학기',
        chapters: [
          { id: 'MS3-2-1', name: '피타고라스 정리', units: [
            { id: 'MS3-2-1-1', name: '피타고라스 정리의 뜻과 증명' },
            { id: 'MS3-2-1-2', name: '피타고라스 정리의 활용' },
          ]},
          { id: 'MS3-2-2', name: '삼각비', units: [
            { id: 'MS3-2-2-1', name: '삼각비' },
            { id: 'MS3-2-2-2', name: '삼각비의 활용' },
          ]},
          { id: 'MS3-2-3', name: '원의 성질', units: [
            { id: 'MS3-2-3-1', name: '원과 직선' },
            { id: 'MS3-2-3-2', name: '원주각' },
          ]},
          { id: 'MS3-2-4', name: '통계', units: [
            { id: 'MS3-2-4-1', name: '대푯값과 산포도' },
            { id: 'MS3-2-4-2', name: '상관관계' },
          ]},
        ],
      },
    ],
  },
];

// ============================================================================
// 고등학교 (High School) — 과목별 (학기 구분 없음)
// 2015 개정 교육과정 기준
// ============================================================================

const highSchoolGrades: CurriculumGrade[] = [
  {
    id: 'HS_MATH_A',
    label: '수학 (상)',
    schoolLevel: '고등학교',
    semesters: [
      {
        id: 'HS_MATH_A-1',
        label: '',
        chapters: [
          { id: 'HS_MATH_A-1', name: '다항식', units: [
            { id: 'HS_MATH_A-1-1', name: '다항식의 연산' },
            { id: 'HS_MATH_A-1-2', name: '나머지정리' },
            { id: 'HS_MATH_A-1-3', name: '인수분해' },
          ]},
          { id: 'HS_MATH_A-2', name: '방정식과 부등식', units: [
            { id: 'HS_MATH_A-2-1', name: '복소수와 이차방정식' },
            { id: 'HS_MATH_A-2-2', name: '이차방정식과 이차함수' },
            { id: 'HS_MATH_A-2-3', name: '여러 가지 방정식' },
            { id: 'HS_MATH_A-2-4', name: '여러 가지 부등식' },
          ]},
          { id: 'HS_MATH_A-3', name: '도형의 방정식', units: [
            { id: 'HS_MATH_A-3-1', name: '평면좌표' },
            { id: 'HS_MATH_A-3-2', name: '직선의 방정식' },
            { id: 'HS_MATH_A-3-3', name: '원의 방정식' },
            { id: 'HS_MATH_A-3-4', name: '도형의 이동' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'HS_MATH_B',
    label: '수학 (하)',
    schoolLevel: '고등학교',
    semesters: [
      {
        id: 'HS_MATH_B-1',
        label: '',
        chapters: [
          { id: 'HS_MATH_B-1', name: '집합과 명제', units: [
            { id: 'HS_MATH_B-1-1', name: '집합' },
            { id: 'HS_MATH_B-1-2', name: '명제' },
          ]},
          { id: 'HS_MATH_B-2', name: '함수', units: [
            { id: 'HS_MATH_B-2-1', name: '함수' },
            { id: 'HS_MATH_B-2-2', name: '유리함수' },
            { id: 'HS_MATH_B-2-3', name: '무리함수' },
          ]},
          { id: 'HS_MATH_B-3', name: '경우의 수', units: [
            { id: 'HS_MATH_B-3-1', name: '경우의 수' },
            { id: 'HS_MATH_B-3-2', name: '순열과 조합' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'HS_MATH1',
    label: '수학Ⅰ',
    schoolLevel: '고등학교',
    semesters: [
      {
        id: 'HS_MATH1-1',
        label: '',
        chapters: [
          { id: 'HS_MATH1-1', name: '지수함수와 로그함수', units: [
            { id: 'HS_MATH1-1-1', name: '지수' },
            { id: 'HS_MATH1-1-2', name: '로그' },
            { id: 'HS_MATH1-1-3', name: '지수함수와 그 그래프' },
            { id: 'HS_MATH1-1-4', name: '로그함수와 그 그래프' },
          ]},
          { id: 'HS_MATH1-2', name: '삼각함수', units: [
            { id: 'HS_MATH1-2-1', name: '일반각과 호도법' },
            { id: 'HS_MATH1-2-2', name: '삼각함수' },
            { id: 'HS_MATH1-2-3', name: '삼각함수의 그래프' },
            { id: 'HS_MATH1-2-4', name: '사인법칙과 코사인법칙' },
          ]},
          { id: 'HS_MATH1-3', name: '수열', units: [
            { id: 'HS_MATH1-3-1', name: '등차수열' },
            { id: 'HS_MATH1-3-2', name: '등비수열' },
            { id: 'HS_MATH1-3-3', name: '수열의 합' },
            { id: 'HS_MATH1-3-4', name: '수학적 귀납법' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'HS_MATH2',
    label: '수학Ⅱ',
    schoolLevel: '고등학교',
    semesters: [
      {
        id: 'HS_MATH2-1',
        label: '',
        chapters: [
          { id: 'HS_MATH2-1', name: '함수의 극한과 연속', units: [
            { id: 'HS_MATH2-1-1', name: '함수의 극한' },
            { id: 'HS_MATH2-1-2', name: '함수의 연속' },
          ]},
          { id: 'HS_MATH2-2', name: '미분', units: [
            { id: 'HS_MATH2-2-1', name: '미분계수' },
            { id: 'HS_MATH2-2-2', name: '도함수' },
            { id: 'HS_MATH2-2-3', name: '도함수의 활용' },
          ]},
          { id: 'HS_MATH2-3', name: '적분', units: [
            { id: 'HS_MATH2-3-1', name: '부정적분' },
            { id: 'HS_MATH2-3-2', name: '정적분' },
            { id: 'HS_MATH2-3-3', name: '정적분의 활용' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'HS_CALCULUS',
    label: '미적분',
    schoolLevel: '고등학교',
    semesters: [
      {
        id: 'HS_CALCULUS-1',
        label: '',
        chapters: [
          { id: 'HS_CALCULUS-1', name: '수열의 극한', units: [
            { id: 'HS_CALCULUS-1-1', name: '수열의 극한' },
            { id: 'HS_CALCULUS-1-2', name: '급수' },
          ]},
          { id: 'HS_CALCULUS-2', name: '미분법', units: [
            { id: 'HS_CALCULUS-2-1', name: '여러 가지 함수의 미분' },
            { id: 'HS_CALCULUS-2-2', name: '여러 가지 미분법' },
            { id: 'HS_CALCULUS-2-3', name: '도함수의 활용' },
          ]},
          { id: 'HS_CALCULUS-3', name: '적분법', units: [
            { id: 'HS_CALCULUS-3-1', name: '여러 가지 적분법' },
            { id: 'HS_CALCULUS-3-2', name: '정적분의 활용' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'HS_PROB_STAT',
    label: '확률과 통계',
    schoolLevel: '고등학교',
    semesters: [
      {
        id: 'HS_PROB_STAT-1',
        label: '',
        chapters: [
          { id: 'HS_PROB_STAT-1', name: '경우의 수', units: [
            { id: 'HS_PROB_STAT-1-1', name: '순열과 조합' },
            { id: 'HS_PROB_STAT-1-2', name: '이항정리' },
          ]},
          { id: 'HS_PROB_STAT-2', name: '확률', units: [
            { id: 'HS_PROB_STAT-2-1', name: '확률의 뜻과 활용' },
            { id: 'HS_PROB_STAT-2-2', name: '조건부확률' },
          ]},
          { id: 'HS_PROB_STAT-3', name: '통계', units: [
            { id: 'HS_PROB_STAT-3-1', name: '확률분포' },
            { id: 'HS_PROB_STAT-3-2', name: '통계적 추정' },
          ]},
        ],
      },
    ],
  },

  {
    id: 'HS_GEOMETRY',
    label: '기하',
    schoolLevel: '고등학교',
    semesters: [
      {
        id: 'HS_GEOMETRY-1',
        label: '',
        chapters: [
          { id: 'HS_GEOMETRY-1', name: '이차곡선', units: [
            { id: 'HS_GEOMETRY-1-1', name: '포물선' },
            { id: 'HS_GEOMETRY-1-2', name: '타원' },
            { id: 'HS_GEOMETRY-1-3', name: '쌍곡선' },
            { id: 'HS_GEOMETRY-1-4', name: '이차곡선과 직선의 위치관계' },
          ]},
          { id: 'HS_GEOMETRY-2', name: '평면벡터', units: [
            { id: 'HS_GEOMETRY-2-1', name: '벡터의 연산' },
            { id: 'HS_GEOMETRY-2-2', name: '평면벡터의 성분과 내적' },
          ]},
          { id: 'HS_GEOMETRY-3', name: '공간도형과 공간좌표', units: [
            { id: 'HS_GEOMETRY-3-1', name: '공간도형' },
            { id: 'HS_GEOMETRY-3-2', name: '공간좌표' },
          ]},
        ],
      },
    ],
  },
];

// ============================================================================
// 전체 커리큘럼 트리 (학교급별로 묶음)
// ============================================================================

export const CURRICULUM_GRADES: CurriculumGrade[] = [
  ...elementaryGrades,
  ...middleGrades,
  ...highSchoolGrades,
];

/** 학교급별 그룹 */
export const CURRICULUM_BY_SCHOOL = {
  '초등학교': elementaryGrades,
  '중학교': middleGrades,
  '고등학교': highSchoolGrades,
};

/** 학교급 탭 목록 */
export const SCHOOL_TABS = ['전체', '초등', '중학', '고등'] as const;
export type SchoolTab = typeof SCHOOL_TABS[number];

/** 학교급 탭 → schoolLevel 매핑 */
export const SCHOOL_TAB_TO_LEVEL: Record<SchoolTab, string | null> = {
  전체: null,
  초등: '초등학교',
  중학: '중학교',
  고등: '고등학교',
};

/** ID로 단원 찾기 유틸 */
export function findChapterById(chapterId: string): { grade: CurriculumGrade; chapter: CurriculumChapter } | null {
  for (const grade of CURRICULUM_GRADES) {
    for (const sem of grade.semesters) {
      const ch = sem.chapters.find(c => c.id === chapterId);
      if (ch) return { grade, chapter: ch };
    }
  }
  return null;
}
