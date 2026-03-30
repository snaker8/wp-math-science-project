# ============================================================================
# HWPX 시험지 생성 스크립트
# HWP COM API를 사용하여 수식이 포함된 시험지를 HWPX로 생성
#
# 사용법: python generate-hwpx.py <input.json> <output.hwpx>
# input.json: { title, subtitle, problems: [{number, content, choices, answer, solution, points}], config }
# ============================================================================

import sys
import json
import os
import re
import win32com.client
import time

# ============================================================================
# LaTeX → HWP 수식 변환
# ============================================================================

def latex_to_hwp_equation(latex: str) -> str:
    eq = latex.strip()

    # 수식 래퍼 제거
    eq = re.sub(r'^\\\(|\\\)$', '', eq)
    eq = re.sub(r'^\$\$?|\$\$?$', '', eq)
    eq = eq.strip()

    # \frac{a}{b} → {a} over {b}
    for _ in range(5):
        eq = re.sub(r'\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}', r'{\1} over {\2}', eq)

    # \sqrt[n]{x} → root n of {x}
    eq = re.sub(r'\\sqrt\[(\d+)\]\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}', r'root \1 of {\2}', eq)

    # \sqrt{x} → sqrt {x}
    eq = re.sub(r'\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}', r'sqrt {\1}', eq)
    eq = re.sub(r'\\sqrt\s*(\d)', r'sqrt {\1}', eq)

    # \log_{b} → log _{b}
    eq = re.sub(r'\\log_\{([^{}]*)\}', r'log _{\1}', eq)
    eq = re.sub(r'\\log_(\w)', r'log _{\1}', eq)
    eq = re.sub(r'\\log\b', 'log', eq)
    eq = re.sub(r'\\ln\b', 'ln', eq)

    # 삼각함수
    for fn in ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan']:
        eq = re.sub(rf'\\{fn}\b', fn, eq)

    # \lim_{x \to a} → lim from {x -> a}
    eq = re.sub(r'\\lim_\{([^{}]*?)\\to\s*([^{}]*?)\}', r'lim from {\1 -> \2}', eq)
    eq = re.sub(r'\\lim\b', 'lim', eq)

    # \sum, \prod, \int
    eq = re.sub(r'\\sum_\{([^{}]*)\}\^\{([^{}]*)\}', r'sum from {\1} to {\2}', eq)
    eq = re.sub(r'\\sum\b', 'sum', eq)
    eq = re.sub(r'\\prod_\{([^{}]*)\}\^\{([^{}]*)\}', r'prod from {\1} to {\2}', eq)
    eq = re.sub(r'\\prod\b', 'prod', eq)
    eq = re.sub(r'\\int_\{([^{}]*)\}\^\{([^{}]*)\}', r'int from {\1} to {\2}', eq)
    eq = re.sub(r'\\int\b', 'int', eq)

    # \overline, \vec
    eq = re.sub(r'\\overline\{([^{}]*)\}', r'overline {\1}', eq)
    eq = re.sub(r'\\bar\{([^{}]*)\}', r'bar {\1}', eq)
    eq = re.sub(r'\\vec\{([^{}]*)\}', r'vec {\1}', eq)

    # 행렬
    def matrix_replace(m):
        content = m.group(1)
        rows = [r.strip().replace('&', '#') for r in content.split('\\\\')]
        return 'matrix {' + ' ## '.join(rows) + '}'
    eq = re.sub(r'\\begin\{(?:pmatrix|bmatrix|matrix)\}([\s\S]*?)\\end\{(?:pmatrix|bmatrix|matrix)\}', matrix_replace, eq)

    # 그리스 문자
    greek = {
        r'\alpha': 'alpha', r'\beta': 'beta', r'\gamma': 'gamma', r'\delta': 'delta',
        r'\epsilon': 'epsilon', r'\varepsilon': 'epsilon', r'\theta': 'theta',
        r'\lambda': 'lambda', r'\mu': 'mu', r'\nu': 'nu', r'\xi': 'xi',
        r'\pi': 'pi', r'\rho': 'rho', r'\sigma': 'sigma', r'\tau': 'tau',
        r'\phi': 'phi', r'\varphi': 'phi', r'\chi': 'chi', r'\psi': 'psi', r'\omega': 'omega',
        r'\Gamma': 'GAMMA', r'\Delta': 'DELTA', r'\Theta': 'THETA', r'\Lambda': 'LAMBDA',
        r'\Sigma': 'SIGMA', r'\Pi': 'PI', r'\Phi': 'PHI', r'\Psi': 'PSI', r'\Omega': 'OMEGA',
    }
    for tex, hwp in greek.items():
        eq = re.sub(re.escape(tex) + r'(?![a-zA-Z])', hwp, eq)

    # 수학 기호
    symbols = {
        r'\times': 'times', r'\div': 'div', r'\pm': 'pm', r'\mp': 'mp', r'\cdot': 'cdot',
        r'\leq': 'leq', r'\le': 'leq', r'\geq': 'geq', r'\ge': 'geq',
        r'\neq': 'neq', r'\ne': 'neq', r'\approx': 'approx', r'\equiv': 'equiv',
        r'\sim': 'sim', r'\infty': 'infty',
        r'\in': 'in', r'\notin': 'notin', r'\subset': 'subset', r'\supset': 'supset',
        r'\cup': 'cup', r'\cap': 'cap', r'\emptyset': 'emptyset',
        r'\forall': 'forall', r'\exists': 'exists',
        r'\rightarrow': 'rightarrow', r'\to': 'rightarrow',
        r'\leftarrow': 'leftarrow',
        r'\Rightarrow': 'Rightarrow', r'\Leftarrow': 'Leftarrow',
        r'\therefore': 'therefore', r'\because': 'because',
        r'\angle': 'angle', r'\triangle': 'triangle',
        r'\parallel': 'parallel', r'\perp': 'perp',
        r'\prime': '`',
    }
    for tex, hwp in symbols.items():
        eq = re.sub(re.escape(tex) + r'(?![a-zA-Z])', hwp, eq)

    # \left, \right 제거
    eq = re.sub(r'\\left\s*', '', eq)
    eq = re.sub(r'\\right\s*', '', eq)

    # \mathrm, \text 등
    eq = re.sub(r'\\(?:mathrm|text|textbf|mathbf|operatorname)\{([^{}]*)\}', r'"\1"', eq)

    # 남은 LaTeX 명령
    eq = re.sub(r'\\[a-zA-Z]+\{([^{}]*)\}', r'\1', eq)
    eq = re.sub(r'\\[a-zA-Z]+', '', eq)

    eq = re.sub(r'\s+', ' ', eq).strip()
    return eq


# ============================================================================
# 컨텐츠 파싱: HTML/LaTeX → 텍스트 + 수식 세그먼트
# ============================================================================

def parse_content(content: str):
    """Returns list of (type, value) tuples: ('text', '...') or ('eq', '...')"""
    if not content:
        return [('text', '')]

    text = content
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]*>', '', text)
    text = text.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')

    segments = []
    pattern = re.compile(r'\\\((.+?)\\\)|\$\$(.+?)\$\$|\$(.+?)\$')
    last_idx = 0

    for m in pattern.finditer(text):
        if m.start() > last_idx:
            t = text[last_idx:m.start()]
            if t:
                segments.append(('text', t))

        latex = m.group(1) or m.group(2) or m.group(3)
        hwp_eq = latex_to_hwp_equation(latex)
        if hwp_eq:
            segments.append(('eq', hwp_eq))

        last_idx = m.end()

    if last_idx < len(text):
        t = text[last_idx:]
        if t:
            segments.append(('text', t))

    if not segments:
        segments.append(('text', text))

    return segments


# ============================================================================
# HWP COM 헬퍼
# ============================================================================

def insert_text(hwp, text):
    if not text:
        return
    hwp.HAction.GetDefault('InsertText', hwp.HParameterSet.HInsertText.HSet)
    hwp.HParameterSet.HInsertText.Text = text
    hwp.HAction.Execute('InsertText', hwp.HParameterSet.HInsertText.HSet)

def insert_equation(hwp, eq_str):
    if not eq_str:
        return
    hwp.HAction.GetDefault('EquationCreate', hwp.HParameterSet.HEqEdit.HSet)
    hwp.HParameterSet.HEqEdit.string = eq_str
    hwp.HAction.Execute('EquationCreate', hwp.HParameterSet.HEqEdit.HSet)

def insert_newline(hwp):
    hwp.HAction.Run('BreakPara')

def insert_segments(hwp, segments):
    for seg_type, seg_val in segments:
        if seg_type == 'eq':
            insert_equation(hwp, seg_val)
        else:
            insert_text(hwp, seg_val)


# ============================================================================
# 메인: 시험지 생성
# ============================================================================

def generate_exam(data: dict, output_path: str):
    hwp = None
    try:
        hwp = win32com.client.Dispatch('HWPFrame.HwpObject')
        hwp.RegisterModule('FilePathCheckDLL', 'SecurityModule')
        return _generate_exam_inner(hwp, data, output_path)
    except Exception as e:
        raise e
    finally:
        if hwp:
            try:
                hwp.Quit()
            except:
                pass

def _generate_exam_inner(hwp, data: dict, output_path: str):

    # 새 문서
    hwp.HAction.GetDefault('FileNew', hwp.HParameterSet.HFileOpenSave.HSet)
    hwp.HAction.Execute('FileNew', hwp.HParameterSet.HFileOpenSave.HSet)

    config = data.get('config', {})
    title = data.get('title', '수학 평가')
    problems = data.get('problems', [])

    # ── 제목 ──
    insert_text(hwp, title)
    insert_newline(hwp)

    # 부제목
    if data.get('subtitle'):
        insert_text(hwp, data['subtitle'])
        insert_newline(hwp)

    # 이름/반 필드
    if config.get('showNameField', True):
        insert_text(hwp, '이름: ________________    반: ________    날짜: ________')
        insert_newline(hwp)

    insert_newline(hwp)

    # ── 문제들 ──
    circle_nums = ['①', '②', '③', '④', '⑤']

    for prob in problems:
        num = prob.get('number', 0)
        content = prob.get('content', '')
        choices = prob.get('choices', [])
        points = prob.get('points')

        # 문제 번호 + 내용
        insert_text(hwp, f'{num}. ')
        segments = parse_content(content)
        insert_segments(hwp, segments)

        if points:
            insert_text(hwp, f' [{points}점]')

        insert_newline(hwp)

        # 선택지
        for i, choice in enumerate(choices):
            prefix = circle_nums[i] if i < len(circle_nums) else f'({i+1})'
            insert_text(hwp, f'    {prefix} ')
            choice_segs = parse_content(choice)
            insert_segments(hwp, choice_segs)
            insert_newline(hwp)

        insert_newline(hwp)

    # ── 정답표 ──
    if config.get('showAnswerSheet', True):
        insert_newline(hwp)
        insert_text(hwp, '[ 정답 ]')
        insert_newline(hwp)
        answers = []
        for p in problems:
            if p.get('answer') is not None:
                answers.append(f"{p['number']}번: {p['answer']}")
        if answers:
            insert_text(hwp, '    '.join(answers))
            insert_newline(hwp)

    # ── 해설 ──
    if config.get('showSolutions', False):
        insert_newline(hwp)
        insert_text(hwp, '[ 해설 ]')
        insert_newline(hwp)
        for prob in problems:
            sol = prob.get('solution', '')
            if sol:
                insert_text(hwp, f"{prob['number']}. ")
                sol_segs = parse_content(sol)
                insert_segments(hwp, sol_segs)
                insert_newline(hwp)

    # ── 저장 ──
    hwp.HAction.GetDefault('FileSaveAs_S', hwp.HParameterSet.HFileOpenSave.HSet)
    hwp.HParameterSet.HFileOpenSave.filename = os.path.abspath(output_path)
    hwp.HParameterSet.HFileOpenSave.Format = 'HWPX'
    hwp.HAction.Execute('FileSaveAs_S', hwp.HParameterSet.HFileOpenSave.HSet)

    # Quit은 wrapper에서 처리
    return os.path.abspath(output_path)


# ============================================================================
# CLI 진입점
# ============================================================================

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python generate-hwpx.py <input.json> <output.hwpx>', file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    result = generate_exam(data, output_path)

    # JSON 결과 출력 (API에서 파싱)
    print(json.dumps({'success': True, 'path': result}))
