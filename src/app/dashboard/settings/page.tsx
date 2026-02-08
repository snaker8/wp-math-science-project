'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Cpu, Shield, Activity, Save, RefreshCw, AlertCircle, CheckCircle2, Server, Database, MoreHorizontal } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { teacherList, systemLogs } from '@/lib/mock-data';

// --- Types & Interfaces ---
type Tab = 'general' | 'ai-engine' | 'permissions' | 'logs';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ai-engine');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // AI Engine State
  const [variationStrength, setVariationStrength] = useState(50);
  const [difficultySensitivity, setDifficultySensitivity] = useState(75);
  const [ocrPrecision, setOcrPrecision] = useState(90);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setHasChanges(false);
    }, 1500);
  };

  const handleSettingChange = (setter: (val: number) => void, val: number) => {
    setter(val);
    setHasChanges(true);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10 pb-24 relative overflow-hidden font-sans">
      {/* Background Grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 relative">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 mb-1">
            <Settings size={18} />
            <span className="text-xs font-bold tracking-widest uppercase">System Control</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">시스템 설정 및 AI 엔진 제어</h1>
          <p className="text-zinc-500 mt-1">플랫폼의 핵심 파라미터와 접근 권한을 관리하는 엔지니어링 워크스페이스입니다.</p>
        </div>

        {/* Save Status - Mobile/Desktop */}
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-2xl shadow-indigo-500/30 flex items-center gap-4 z-50 cursor-pointer hover:bg-indigo-500 transition-colors"
            onClick={handleSave}
          >
            <span className="font-semibold text-sm">변경 사항이 있습니다</span>
            <div className="h-4 w-[1px] bg-white/30" />
            <div className="flex items-center gap-2">
              {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
              <span className="text-sm font-bold uppercase">{isSaving ? '저장 중...' : '저장하기'}</span>
            </div>
          </motion.div>
        )}
      </header>

      {/* Tab Navigation */}
      <nav className="flex items-center gap-8 border-b border-white/10 mb-8 z-10 relative overflow-x-auto no-scrollbar">
        {[
          { id: 'general', label: 'General', icon: Settings },
          { id: 'ai-engine', label: 'AI Engine', icon: Cpu },
          { id: 'permissions', label: 'Permissions', icon: Shield },
          { id: 'logs', label: 'System Logs', icon: Activity },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`pb-4 flex items-center gap-2 relative transition-colors ${activeTab === tab.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            <tab.icon size={18} />
            <span className="font-semibold">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
              />
            )}
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <main className="z-10 relative min-h-[500px]">
        <AnimatePresence mode="wait">
          {/* --- AI Engine Tab --- */}
          {activeTab === 'ai-engine' && (
            <motion.div
              key="ai-engine"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Sliders Panel */}
              <div className="lg:col-span-4 space-y-8">
                <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Cpu size={20} className="text-indigo-400" />
                    알고리즘 정밀 튜닝
                  </h3>

                  <div className="space-y-8">
                    {/* Slider 1 */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-zinc-300">유사 문제 변형 강도</label>
                        <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">{variationStrength}%</span>
                      </div>
                      <input
                        type="range" min="0" max="100"
                        value={variationStrength}
                        onChange={(e) => handleSettingChange(setVariationStrength, Number(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        값이 높을수록 원본 문제의 구조를 더 과감하게 변형합니다. (30~60% 권장)
                      </p>
                    </div>

                    {/* Slider 2 */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-zinc-300">난이도 자동 조절 민감도</label>
                        <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">{difficultySensitivity}%</span>
                      </div>
                      <input
                        type="range" min="0" max="100"
                        value={difficultySensitivity}
                        onChange={(e) => handleSettingChange(setDifficultySensitivity, Number(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        학생의 오답률에 따라 난이도를 얼마나 빠르게 조정할지 결정합니다.
                      </p>
                    </div>

                    {/* Slider 3 */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-zinc-300">OCR 인식 정밀도 (Latency Trade-off)</label>
                        <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">{ocrPrecision}%</span>
                      </div>
                      <input
                        type="range" min="50" max="100"
                        value={ocrPrecision}
                        onChange={(e) => handleSettingChange(setOcrPrecision, Number(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        정밀도를 높이면 처리 속도가 늦어질 수 있습니다. (서술형 문제 권장: 90%+)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview Panel */}
              <div className="lg:col-span-8">
                <div className="bg-zinc-900 border border-indigo-500/20 rounded-2xl p-1 relative overflow-hidden h-full min-h-[400px]">
                  {/* Grid Background */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />

                  <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-indigo-300 uppercase">Live Simulation</span>
                  </div>

                  <div className="h-full flex items-center justify-center p-8 relative z-10">
                    <div className="grid grid-cols-2 gap-8 w-full max-w-2xl">
                      {/* Original Problem */}
                      <div className="bg-black/50 border border-white/10 p-6 rounded-xl backdrop-blur-md">
                        <p className="text-xs text-zinc-500 mb-4 font-mono">INPUT_SOURCE</p>
                        <div className="font-serif text-zinc-300 text-lg">
                          f(x) = x² + 2x + 1
                        </div>
                        <div className="mt-4 text-sm text-zinc-500">
                          Find the derivative f&apos;(x).
                        </div>
                      </div>

                      {/* Generated Variation */}
                      <motion.div
                        className="bg-indigo-950/20 border border-indigo-500/30 p-6 rounded-xl backdrop-blur-md relative"
                        animate={{
                          borderColor: variationStrength > 70 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(99, 102, 241, 0.3)',
                          scale: [1, 1.02, 1],
                        }}
                        transition={{ duration: 0.5 }}
                      >
                        <div className="absolute -top-3 -right-3 bg-indigo-600 text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                          VARIATION: {variationStrength}%
                        </div>
                        <p className="text-xs text-indigo-400 mb-4 font-mono">OUTPUT_TARGET</p>
                        <motion.div
                          key={variationStrength} // Re-render text on change
                          initial={{ opacity: 0.5, filter: 'blur(2px)' }}
                          animate={{ opacity: 1, filter: 'blur(0px)' }}
                          className="font-serif text-white text-lg"
                        >
                          {variationStrength < 30 ? "g(t) = t² + 4t + 4" :
                            variationStrength < 70 ? "h(x) = 3x² + 6x + 5" :
                              "k(z) = ln(z² + 2z + 1)"}
                        </motion.div>
                        <div className="mt-4 text-sm text-indigo-200/70">
                          {variationStrength < 50 ? "Find the derivative." : "Calculate the critical points."}
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Tech Lines */}
                  <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
                  <div className="absolute top-0 right-10 w-[1px] h-full bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent" />
                </div>
              </div>
            </motion.div>
          )}

          {/* --- Permissions Tab --- */}
          {activeTab === 'permissions' && (
            <motion.div
              key="permissions"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-900/50 border border-white/10 rounded-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Shield size={20} className="text-emerald-400" />
                  Access Control Lists (ACL)
                </h3>
                <button className="bg-white/5 hover:bg-white/10 text-xs px-3 py-2 rounded-lg transition-colors border border-white/10">
                  + Add New User
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 text-zinc-400 uppercase text-xs font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Name / ID</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Last Active</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {teacherList.map((teacher, idx) => (
                      <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{teacher.name}</div>
                          <div className="text-xs text-zinc-500">{teacher.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${teacher.role === 'Director' ? 'bg-purple-500/20 text-purple-400' :
                              teacher.role === 'Tutor' ? 'bg-indigo-500/20 text-indigo-400' :
                                'bg-zinc-500/20 text-zinc-400'
                            }`}>
                            {teacher.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${teacher.status === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <span className="text-zinc-300">{teacher.status}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-zinc-500">
                          {teacher.lastActive}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-zinc-500 hover:text-white transition-colors">
                            <MoreHorizontal size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* --- Logs Tab --- */}
          {activeTab === 'logs' && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Server size={20} className="text-blue-400" />
                    <h3 className="font-bold">API Server Health</h3>
                  </div>
                  <span className="text-emerald-400 text-sm font-bold animate-pulse">● Operational</span>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={systemLogs}>
                      <Line type="monotone" dataKey="latency" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={true} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-between text-xs text-zinc-500 font-mono">
                  <span>Latency (ms)</span>
                  <span>Last 30 min</span>
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Database size={20} className="text-purple-400" />
                    <h3 className="font-bold">Database Connections</h3>
                  </div>
                  <span className="text-zinc-500 text-sm">Active: 42</span>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={systemLogs}>
                      <Line type="step" dataKey="status" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={true} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-between text-xs text-zinc-500 font-mono">
                  <span>Pool Utilization (%)</span>
                  <span>Last 30 min</span>
                </div>
              </div>
            </motion.div>
          )}
          {/* --- General Tab (Placeholder) --- */}
          {activeTab === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-[400px] text-zinc-500"
            >
              <Settings size={48} className="mb-4 opacity-20" />
              <p>General Environment Settings</p>
              <p className="text-xs mt-2">Theme, Localization, and Organization Info</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
