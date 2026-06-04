// 시험지·빠른답·해설 DOM 을 인쇄용 root 로 복제 후 window.print 호출.
// exam-management 와 exam-create 양쪽에서 공유. 호출 전 페이지 측이 다음 DOM 을
// 마크업해 두어야 한다:
//   - 시험지 페이지: `.preview-exam-page` (필수)
//   - 시험지 헤더 (학원명/시험명 등): `.exam-meta-header` (선택)
//   - 빠른답: `.print-section-answer` 또는 `.quick-answer-print`
//   - 해설지: `.solution-page` (다중) 또는 `.print-section-solution`

export interface PrintSections {
  exam: boolean;
  answer: boolean;
  solution: boolean;
}

/** 파일명/탭제목 안전화 — 금지문자 제거, 한글 유지. */
function sanitizeTitle(t: string | null | undefined): string {
  return (t || '시험지').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim() || '시험지';
}

/** 인쇄 구성에 따른 접미사 — 문제지 / 해설 / 빠른답. */
function sectionSuffix(s: PrintSections): string {
  if (s.exam) return '문제지';
  if (s.solution) return '해설';
  if (s.answer) return '빠른답';
  return '문제지';
}

/** "시험지명 + 접미사" 파일명. 이미 접미사로 끝나면 중복 안 붙임. */
function buildPrintTitle(title: string | null | undefined, sections: PrintSections): string {
  const base = sanitizeTitle(title);
  const suffix = sectionSuffix(sections);
  return base.endsWith(suffix) ? base : `${base} ${suffix}`;
}

export function executeExamPrint(printSections: PrintSections, title?: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const printRoot = document.createElement('div');
  printRoot.id = 'exam-print-root';

  if (printSections.exam) {
    const previewPages = document.querySelectorAll('.preview-exam-page');
    const metaHeader = document.querySelector('.exam-meta-header');
    previewPages.forEach((page, idx) => {
      const clone = page.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.page-divider-ui').forEach((el) => el.remove());
      clone.classList.add('exam-page');
      if (idx === previewPages.length - 1) {
        clone.classList.add('exam-last-page');
      }
      if (idx === 0 && metaHeader) {
        const headerClone = metaHeader.cloneNode(true) as HTMLElement;
        headerClone.querySelectorAll('input').forEach((input) => {
          const span = document.createElement('span');
          span.textContent = (input as HTMLInputElement).value || (input as HTMLInputElement).placeholder || '';
          span.style.cssText = 'padding: 2px 6px; font-weight: bold; color: #111; font-size: 14px;';
          input.replaceWith(span);
        });
        headerClone.querySelectorAll('select').forEach((select) => {
          const span = document.createElement('span');
          const sel = select as HTMLSelectElement;
          const selectedOption = sel.options[sel.selectedIndex];
          span.textContent = selectedOption?.textContent || '';
          span.style.cssText = 'padding: 2px 6px; font-weight: bold; color: #111; font-size: 14px;';
          select.replaceWith(span);
        });
        headerClone.style.marginBottom = '12px';
        clone.insertBefore(headerClone, clone.firstChild);
      }
      printRoot.appendChild(clone);
    });
  }

  if (printSections.answer) {
    const answerSection =
      document.querySelector('.print-section-answer') || document.querySelector('.quick-answer-print');
    if (answerSection) {
      const clone = answerSection.cloneNode(true) as HTMLElement;
      clone.classList.add('exam-page');
      printRoot.appendChild(clone);
    }
  }

  if (printSections.solution) {
    const solutionPages = document.querySelectorAll('.solution-page');
    if (solutionPages.length > 0) {
      solutionPages.forEach((page) => {
        const clone = page.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page');
        printRoot.appendChild(clone);
      });
    } else {
      const solutionSection = document.querySelector('.print-section-solution');
      if (solutionSection) {
        const clone = solutionSection.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page');
        printRoot.appendChild(clone);
      }
    }
  }

  if (printRoot.children.length === 0) return false;

  document.body.appendChild(printRoot);
  // ★ 브라우저 PDF 저장 파일명 = document.title. 인쇄 동안만 시험지명으로 바꾸고 복원.
  const prevTitle = document.title;
  document.title = buildPrintTitle(title, printSections);
  try {
    window.print();
  } finally {
    document.title = prevTitle;
    document.body.removeChild(printRoot);
  }
  return true;
}
