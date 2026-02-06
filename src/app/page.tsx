'use client';

import Link from 'next/link';
import { FileText, Edit3, BarChart3, Upload } from 'lucide-react';

export default function Home() {
  return (
    <div className="home-page">
      <header className="hero">
        <div className="hero-content">
          <h1>과사람 수학 문제은행</h1>
          <p>대치동 하이엔드 수학 교육을 위한 AI 기반 문제은행 플랫폼</p>
          <div className="hero-actions">
            <Link href="/dashboard" className="btn-primary">
              <BarChart3 size={18} />
              대시보드 시작하기
            </Link>
            <Link href="/editor" className="btn-secondary">
              <Edit3 size={18} />
              에디터 시작하기
            </Link>
          </div>
        </div>
      </header>

      <main className="features">
        <h2>주요 기능</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Upload size={24} />
            </div>
            <h3>OCR 문제 변환</h3>
            <p>PDF/이미지를 업로드하면 Mathpix AI가 자동으로 LaTeX 수식으로 변환합니다.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Edit3 size={24} />
            </div>
            <h3>수학 전용 에디터</h3>
            <p>실시간 LaTeX 렌더링과 Desmos 그래프 도구로 완벽한 문제 작성이 가능합니다.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <FileText size={24} />
            </div>
            <h3>AI 자동 분류</h3>
            <p>3,569개 유형, 5단계 난이도, 4가지 인지영역으로 자동 분류됩니다.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <BarChart3 size={24} />
            </div>
            <h3>정밀 진단 시스템</h3>
            <p>4단계 채점과 히트맵으로 학생의 취약점을 정확히 파악합니다.</p>
          </div>
        </div>
      </main>

      <style jsx>{`
        .home-page {
          min-height: 100vh;
        }

        .hero {
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%);
          color: white;
          padding: 80px 24px;
          text-align: center;
        }

        .hero-content {
          max-width: 800px;
          margin: 0 auto;
        }

        .hero h1 {
          font-size: 48px;
          font-weight: 800;
          margin-bottom: 16px;
          background: linear-gradient(to right, #ffffff, #c7d2fe);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero p {
          font-size: 18px;
          color: #c7d2fe;
          margin-bottom: 32px;
        }

        .hero-actions {
          display: flex;
          justify-content: center;
          gap: 16px;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          font-size: 16px;
          font-weight: 600;
          color: #1e1b4b;
          background: white;
          border-radius: 12px;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }

        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          font-size: 16px;
          font-weight: 600;
          color: white;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 12px;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.25);
        }

        .features {
          max-width: 1200px;
          margin: 0 auto;
          padding: 80px 24px;
        }

        .features h2 {
          text-align: center;
          font-size: 32px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 48px;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 24px;
        }

        .feature-card {
          background: white;
          border-radius: 16px;
          padding: 32px;
          border: 1px solid #e5e7eb;
          transition: all 0.2s;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
          border-color: #c7d2fe;
        }

        .feature-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
          border-radius: 12px;
          color: #4f46e5;
          margin-bottom: 20px;
        }

        .feature-card h3 {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 12px;
        }

        .feature-card p {
          font-size: 14px;
          line-height: 1.6;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
