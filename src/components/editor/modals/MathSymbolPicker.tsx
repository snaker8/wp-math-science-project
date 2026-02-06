'use client';

// ============================================================================
// Math Symbol Picker Modal
// ============================================================================

import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import katex from 'katex';
import type { MathSymbolCategory } from '@/types/editor';

interface MathSymbolPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (latex: string) => void;
}

const MATH_SYMBOLS: MathSymbolCategory[] = [
  {
    name: '기본 연산',
    symbols: [
      { latex: '+', display: '+', description: '덧셈' },
      { latex: '-', display: '-', description: '뺄셈' },
      { latex: '\\times', display: '×', description: '곱셈' },
      { latex: '\\div', display: '÷', description: '나눗셈' },
      { latex: '\\pm', display: '±', description: '플러스마이너스' },
      { latex: '\\mp', display: '∓', description: '마이너스플러스' },
      { latex: '\\cdot', display: '·', description: '점 곱셈' },
      { latex: '\\ast', display: '∗', description: '별표' },
    ],
  },
  {
    name: '분수/루트',
    symbols: [
      { latex: '\\frac{a}{b}', display: 'a/b', description: '분수' },
      { latex: '\\dfrac{a}{b}', display: 'a/b (큰)', description: '큰 분수' },
      { latex: '\\sqrt{x}', display: '√x', description: '제곱근' },
      { latex: '\\sqrt[n]{x}', display: 'ⁿ√x', description: 'n제곱근' },
      { latex: 'x^{n}', display: 'xⁿ', description: '거듭제곱' },
      { latex: 'x_{n}', display: 'xₙ', description: '아래첨자' },
      { latex: 'x^{a}_{b}', display: 'xᵃᵦ', description: '위/아래첨자' },
    ],
  },
  {
    name: '그리스 문자',
    symbols: [
      { latex: '\\alpha', display: 'α', description: '알파' },
      { latex: '\\beta', display: 'β', description: '베타' },
      { latex: '\\gamma', display: 'γ', description: '감마' },
      { latex: '\\delta', display: 'δ', description: '델타' },
      { latex: '\\epsilon', display: 'ε', description: '엡실론' },
      { latex: '\\theta', display: 'θ', description: '세타' },
      { latex: '\\lambda', display: 'λ', description: '람다' },
      { latex: '\\mu', display: 'μ', description: '뮤' },
      { latex: '\\pi', display: 'π', description: '파이' },
      { latex: '\\sigma', display: 'σ', description: '시그마' },
      { latex: '\\phi', display: 'φ', description: '파이' },
      { latex: '\\omega', display: 'ω', description: '오메가' },
      { latex: '\\Delta', display: 'Δ', description: '대문자 델타' },
      { latex: '\\Sigma', display: 'Σ', description: '대문자 시그마' },
      { latex: '\\Omega', display: 'Ω', description: '대문자 오메가' },
    ],
  },
  {
    name: '관계 연산자',
    symbols: [
      { latex: '=', display: '=', description: '같음' },
      { latex: '\\neq', display: '≠', description: '같지 않음' },
      { latex: '<', display: '<', description: '작음' },
      { latex: '>', display: '>', description: '큼' },
      { latex: '\\leq', display: '≤', description: '작거나 같음' },
      { latex: '\\geq', display: '≥', description: '크거나 같음' },
      { latex: '\\approx', display: '≈', description: '약' },
      { latex: '\\equiv', display: '≡', description: '합동' },
      { latex: '\\sim', display: '∼', description: '닮음' },
      { latex: '\\propto', display: '∝', description: '비례' },
    ],
  },
  {
    name: '집합',
    symbols: [
      { latex: '\\in', display: '∈', description: '원소' },
      { latex: '\\notin', display: '∉', description: '원소 아님' },
      { latex: '\\subset', display: '⊂', description: '부분집합' },
      { latex: '\\subseteq', display: '⊆', description: '부분집합 (같음 포함)' },
      { latex: '\\supset', display: '⊃', description: '상위집합' },
      { latex: '\\cup', display: '∪', description: '합집합' },
      { latex: '\\cap', display: '∩', description: '교집합' },
      { latex: '\\emptyset', display: '∅', description: '공집합' },
      { latex: '\\mathbb{R}', display: 'ℝ', description: '실수' },
      { latex: '\\mathbb{N}', display: 'ℕ', description: '자연수' },
      { latex: '\\mathbb{Z}', display: 'ℤ', description: '정수' },
      { latex: '\\mathbb{Q}', display: 'ℚ', description: '유리수' },
    ],
  },
  {
    name: '미적분',
    symbols: [
      { latex: '\\lim_{x \\to a}', display: 'lim', description: '극한' },
      { latex: '\\sum_{i=1}^{n}', display: 'Σ', description: '합' },
      { latex: '\\prod_{i=1}^{n}', display: 'Π', description: '곱' },
      { latex: '\\int', display: '∫', description: '적분' },
      { latex: '\\int_{a}^{b}', display: '∫ₐᵇ', description: '정적분' },
      { latex: '\\iint', display: '∬', description: '이중적분' },
      { latex: '\\oint', display: '∮', description: '선적분' },
      { latex: '\\frac{d}{dx}', display: 'd/dx', description: '미분' },
      { latex: '\\frac{\\partial}{\\partial x}', display: '∂/∂x', description: '편미분' },
      { latex: '\\nabla', display: '∇', description: '나블라' },
      { latex: '\\infty', display: '∞', description: '무한대' },
    ],
  },
  {
    name: '삼각함수',
    symbols: [
      { latex: '\\sin', display: 'sin', description: '사인' },
      { latex: '\\cos', display: 'cos', description: '코사인' },
      { latex: '\\tan', display: 'tan', description: '탄젠트' },
      { latex: '\\cot', display: 'cot', description: '코탄젠트' },
      { latex: '\\sec', display: 'sec', description: '시컨트' },
      { latex: '\\csc', display: 'csc', description: '코시컨트' },
      { latex: '\\arcsin', display: 'arcsin', description: '아크사인' },
      { latex: '\\arccos', display: 'arccos', description: '아크코사인' },
      { latex: '\\arctan', display: 'arctan', description: '아크탄젠트' },
    ],
  },
  {
    name: '로그/지수',
    symbols: [
      { latex: '\\log', display: 'log', description: '로그' },
      { latex: '\\ln', display: 'ln', description: '자연로그' },
      { latex: '\\log_{a}', display: 'logₐ', description: '밑이 a인 로그' },
      { latex: 'e^{x}', display: 'eˣ', description: '지수함수' },
      { latex: 'a^{x}', display: 'aˣ', description: '지수' },
    ],
  },
  {
    name: '괄호',
    symbols: [
      { latex: '\\left( \\right)', display: '( )', description: '소괄호' },
      { latex: '\\left[ \\right]', display: '[ ]', description: '대괄호' },
      { latex: '\\left\\{ \\right\\}', display: '{ }', description: '중괄호' },
      { latex: '\\left| \\right|', display: '| |', description: '절댓값' },
      { latex: '\\left\\| \\right\\|', display: '‖ ‖', description: '노름' },
      { latex: '\\left\\lfloor \\right\\rfloor', display: '⌊ ⌋', description: '내림' },
      { latex: '\\left\\lceil \\right\\rceil', display: '⌈ ⌉', description: '올림' },
    ],
  },
  {
    name: '행렬',
    symbols: [
      { latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', display: '(행렬)', description: '소괄호 행렬' },
      { latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', display: '[행렬]', description: '대괄호 행렬' },
      { latex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}', display: '|행렬|', description: '행렬식' },
      { latex: '\\begin{cases} a & x > 0 \\\\ b & x \\leq 0 \\end{cases}', display: '조건', description: '조건부 함수' },
    ],
  },
  {
    name: '화살표',
    symbols: [
      { latex: '\\rightarrow', display: '→', description: '오른쪽 화살표' },
      { latex: '\\leftarrow', display: '←', description: '왼쪽 화살표' },
      { latex: '\\leftrightarrow', display: '↔', description: '양방향 화살표' },
      { latex: '\\Rightarrow', display: '⇒', description: '이중 오른쪽 화살표' },
      { latex: '\\Leftarrow', display: '⇐', description: '이중 왼쪽 화살표' },
      { latex: '\\Leftrightarrow', display: '⇔', description: '이중 양방향 화살표' },
      { latex: '\\mapsto', display: '↦', description: '대응' },
    ],
  },
  {
    name: '논리',
    symbols: [
      { latex: '\\forall', display: '∀', description: '모든' },
      { latex: '\\exists', display: '∃', description: '존재' },
      { latex: '\\nexists', display: '∄', description: '존재하지 않음' },
      { latex: '\\land', display: '∧', description: '논리곱 (AND)' },
      { latex: '\\lor', display: '∨', description: '논리합 (OR)' },
      { latex: '\\neg', display: '¬', description: '부정 (NOT)' },
      { latex: '\\therefore', display: '∴', description: '그러므로' },
      { latex: '\\because', display: '∵', description: '왜냐하면' },
    ],
  },
];

const MathSymbolPicker: React.FC<MathSymbolPickerProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(MATH_SYMBOLS[0].name);

  // 검색 필터링
  const filteredCategories = searchQuery
    ? MATH_SYMBOLS.map((cat) => ({
        ...cat,
        symbols: cat.symbols.filter(
          (s) =>
            s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.latex.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.display.includes(searchQuery)
        ),
      })).filter((cat) => cat.symbols.length > 0)
    : MATH_SYMBOLS;

  const handleSelect = (latex: string) => {
    onSelect(latex);
    onClose();
  };

  // KaTeX로 미리보기 렌더링
  const renderSymbol = (latex: string) => {
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return latex;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="symbol-picker-overlay">
      <div className="symbol-picker">
        <div className="symbol-picker-header">
          <h3>수학 기호 삽입</h3>
          <button onClick={onClose} className="close-btn">
            <X size={18} />
          </button>
        </div>

        {/* 검색 */}
        <div className="symbol-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="기호 검색..."
            className="search-input"
          />
        </div>

        <div className="symbol-picker-body">
          {/* 카테고리 탭 */}
          {!searchQuery && (
            <div className="category-tabs">
              {MATH_SYMBOLS.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`category-tab ${selectedCategory === cat.name ? 'active' : ''}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* 기호 그리드 */}
          <div className="symbols-container">
            {filteredCategories
              .filter((cat) => searchQuery || cat.name === selectedCategory)
              .map((category) => (
                <div key={category.name} className="category-section">
                  {searchQuery && (
                    <div className="category-title">{category.name}</div>
                  )}
                  <div className="symbols-grid">
                    {category.symbols.map((symbol, idx) => (
                      <button
                        key={`${symbol.latex}-${idx}`}
                        onClick={() => handleSelect(symbol.latex)}
                        className="symbol-btn"
                        title={`${symbol.description}\n${symbol.latex}`}
                      >
                        <span
                          className="symbol-preview"
                          dangerouslySetInnerHTML={{
                            __html: renderSymbol(symbol.latex),
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .symbol-picker-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .symbol-picker {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
        }

        .symbol-picker-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .symbol-picker-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .close-btn {
          padding: 6px;
          background: none;
          border: none;
          color: #6b7280;
          border-radius: 6px;
          cursor: pointer;
        }

        .close-btn:hover {
          background-color: #f3f4f6;
          color: #111827;
        }

        .symbol-search {
          padding: 12px 20px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .search-icon {
          color: #9ca3af;
        }

        .search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14px;
        }

        .symbol-picker-body {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .category-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 12px 20px;
          border-bottom: 1px solid #e5e7eb;
          background-color: #f9fafb;
        }

        .category-tab {
          padding: 6px 12px;
          font-size: 12px;
          color: #4b5563;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .category-tab:hover {
          border-color: #d1d5db;
        }

        .category-tab.active {
          color: #4f46e5;
          background-color: #eef2ff;
          border-color: #c7d2fe;
        }

        .symbols-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
        }

        .category-section {
          margin-bottom: 16px;
        }

        .category-title {
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          margin-bottom: 8px;
        }

        .symbols-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
          gap: 6px;
        }

        .symbol-btn {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .symbol-btn:hover {
          background-color: #f3f4f6;
          border-color: #d1d5db;
          transform: scale(1.05);
        }

        .symbol-preview {
          font-size: 18px;
        }
      `}</style>
    </div>
  );
};

export default MathSymbolPicker;
