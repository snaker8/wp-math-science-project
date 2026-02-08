'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users,
    UserPlus,
    Search,
    MoreHorizontal,
    Shield,
    Check,
    X,
    Mail,
    Phone,
    Calendar,
    Zap,
    Lock,
    Settings,
    CreditCard,
    FileText,
    Activity,
    ChevronDown,
    Filter,
    ArrowUp,
    ArrowDown,
    ArrowUpDown
} from 'lucide-react';
import { GlowCard } from '@/components/shared/GlowCard';
import { mockStaff, StaffMember } from '@/lib/mock-data';

// ============================================================================
// Components
// ============================================================================

const RoleBadge = ({ role }: { role: StaffMember['role'] }) => {
    const styles = {
        Director: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        Manager: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        Tutor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[role]}`}>
            {role.toUpperCase()}
        </span>
    );
};

const ToggleSwitch = ({ enabled, onChange }: { enabled: boolean; onChange?: () => void }) => (
    <button
        onClick={onChange}
        className={`w-8 h-4 rounded-full p-0.5 transition-colors ${enabled ? 'bg-indigo-500' : 'bg-zinc-700'}`}
    >
        <motion.div
            layout
            className="w-3 h-3 bg-white rounded-full shadow-sm"
            animate={{ x: enabled ? 16 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
    </button>
);

const PermissionRow = ({ label, description, enabled, onChange }: { label: string; description: string; enabled: boolean; onChange: () => void }) => (
    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${enabled ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-600'}`}>
                <Lock size={16} />
            </div>
            <div>
                <div className="text-xs font-bold text-white mb-0.5">{label}</div>
                <div className="text-[10px] text-zinc-500">{description}</div>
            </div>
        </div>
        <ToggleSwitch enabled={enabled} onChange={onChange} />
    </div>
);

export default function StaffPage() {
    const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
    const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof StaffMember; direction: 'asc' | 'desc' | null }>({ key: 'name', direction: null });

    const handleSort = (key: keyof StaffMember) => {
        let direction: 'asc' | 'desc' | null = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = null;
        }
        setSortConfig({ key, direction });
    };

    const sortedStaff = React.useMemo(() => {
        let sortableItems = [...mockStaff];

        // Filter
        if (searchTerm) {
            sortableItems = sortableItems.filter(staff =>
                staff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                staff.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Sort
        if (sortConfig.key && sortConfig.direction) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Handle specifically needed types or generic string/number comparison
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = bValue.toLowerCase();
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mockStaff, sortConfig, searchTerm]);

    const SortIcon = ({ columnKey }: { columnKey: keyof StaffMember }) => {
        if (sortConfig.key !== columnKey || sortConfig.direction === null) {
            return <ArrowUpDown size={12} className="text-zinc-700 opacity-50 group-hover:opacity-100 transition-opacity" />;
        }
        if (sortConfig.direction === 'asc') {
            return <ArrowUp size={12} className="text-indigo-400" />;
        }
        return <ArrowDown size={12} className="text-indigo-400" />;
    };

    const handleOpenPermissions = (staff: StaffMember) => {
        setSelectedStaff(staff);
        setIsPermissionModalOpen(true);
    };

    return (
        <div className="min-h-screen bg-black text-white p-6 space-y-8">
            {/* 1. Header Section */}
            <div className="flex items-end justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 px-2 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 tracking-tighter uppercase">
                            Admin Console
                        </div>
                        <span className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Team Management</span>
                    </div>
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
                        교직원 관리
                    </h1>
                </div>
                <button className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all">
                    <UserPlus size={16} /> 신규 교직원 초대
                </button>
            </div>

            {/* 2. Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
                <GlowCard className="bg-zinc-900/50 border-white/5 flex items-center justify-between p-6">
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Total Staff</div>
                        <div className="text-2xl font-bold text-white">12 <span className="text-sm font-normal text-zinc-600">Members</span></div>
                    </div>
                    <div className="p-3 bg-zinc-800 rounded-xl text-zinc-400"><Users size={20} /></div>
                </GlowCard>
                <GlowCard className="bg-zinc-900/50 border-white/5 flex items-center justify-between p-6">
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Active Now</div>
                        <div className="text-2xl font-bold text-indigo-400">8 <span className="text-sm font-normal text-indigo-400/60">Online</span></div>
                    </div>
                    <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400"><Zap size={20} /></div>
                </GlowCard>
                <GlowCard className="bg-zinc-900/50 border-white/5 flex items-center justify-between p-6">
                    <div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">System Activity</div>
                        <div className="text-2xl font-bold text-emerald-400">98% <span className="text-sm font-normal text-emerald-400/60">Healthy</span></div>
                    </div>
                    <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400"><Activity size={20} /></div>
                </GlowCard>
            </div>

            {/* 3. Main Data Table */}
            <div className="space-y-4">
                <div className="flex items-center justify-between p-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
                        <input
                            type="text"
                            placeholder="이름, 이메일 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-zinc-900/50 border border-white/5 rounded-lg py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-white/10 w-64 text-zinc-300 placeholder:text-zinc-600 transition-all focus:w-72"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button className="px-3 py-1.5 rounded-lg border border-white/5 bg-zinc-900/50 text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-2">
                            <Filter size={12} /> Role Filter
                        </button>
                        <button
                            onClick={() => handleSort('lastActive')}
                            className="px-3 py-1.5 rounded-lg border border-white/5 bg-zinc-900/50 text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-2"
                        >
                            <Calendar size={12} /> Last Active
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl border border-white/5 overflow-hidden bg-zinc-900/30 backdrop-blur-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                <th
                                    className={`p-4 w-64 pl-6 cursor-pointer hover:bg-white/5 transition-colors group ${sortConfig.key === 'name' ? 'text-indigo-400' : ''}`}
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-2">
                                        Profile <SortIcon columnKey="name" />
                                    </div>
                                </th>
                                <th
                                    className={`p-4 w-32 cursor-pointer hover:bg-white/5 transition-colors group ${sortConfig.key === 'role' ? 'text-indigo-400' : ''}`}
                                    onClick={() => handleSort('role')}
                                >
                                    <div className="flex items-center gap-2">
                                        Role <SortIcon columnKey="role" />
                                    </div>
                                </th>
                                <th className="p-4">Assigned Classes</th>
                                <th
                                    className={`p-4 w-32 cursor-pointer hover:bg-white/5 transition-colors group ${sortConfig.key === 'joinedDate' ? 'text-indigo-400' : ''}`}
                                    onClick={() => handleSort('joinedDate')}
                                >
                                    <div className="flex items-center gap-2">
                                        Joined <SortIcon columnKey="joinedDate" />
                                    </div>
                                </th>
                                <th
                                    className={`p-4 w-32 cursor-pointer hover:bg-white/5 transition-colors group ${sortConfig.key === 'status' ? 'text-indigo-400' : ''}`}
                                    onClick={() => handleSort('status')}
                                >
                                    <div className="flex items-center gap-2">
                                        Status <SortIcon columnKey="status" />
                                    </div>
                                </th>
                                <th className="p-4 w-20 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            <AnimatePresence mode="popLayout">
                                {sortedStaff.map((staff) => (
                                    <motion.tr
                                        layout
                                        key={staff.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                                        className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                                        onClick={() => handleOpenPermissions(staff)}
                                    >
                                        <td className="p-4 pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-lg ${staff.avatar} flex items-center justify-center text-white font-bold shadow-lg`}>
                                                    {staff.name[0]}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">{staff.name}</div>
                                                    <div className="text-[10px] text-zinc-500 font-medium">{staff.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <RoleBadge role={staff.role} />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {staff.assignedClasses.length > 0 ? staff.assignedClasses.map((cls, i) => (
                                                    <span key={i} className="px-2 py-0.5 rounded bg-zinc-800 border border-white/5 text-[10px] text-zinc-400">
                                                        {cls}
                                                    </span>
                                                )) : (
                                                    <span className="text-[10px] text-zinc-600 italic">No classes</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="text-xs text-zinc-400 font-medium">{staff.joinedDate}</div>
                                            <div className="text-[10px] text-zinc-600">Active: {staff.lastActive}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className={`flex items-center gap-2 text-xs font-bold ${staff.status === 'Active' ? 'text-indigo-400' : 'text-zinc-500'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${staff.status === 'Active' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-zinc-600'}`} />
                                                {staff.status}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <button className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-colors">
                                                <MoreHorizontal size={16} />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                    {sortedStaff.length === 0 && (
                        <div className="p-8 text-center text-zinc-500 text-xs">
                            검색 결과가 없습니다.
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Permissions Modal */}
            <AnimatePresence>
                {isPermissionModalOpen && selectedStaff && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setIsPermissionModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />

                            {/* Modal Header */}
                            <div className="p-6 border-b border-white/5 relative bg-zinc-900/50">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl ${selectedStaff.avatar} flex items-center justify-center text-white font-bold`}>
                                            {selectedStaff.name[0]}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">{selectedStaff.name}</h2>
                                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-medium uppercase tracking-widest">
                                                <Shield size={10} /> Permission Settings
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => setIsPermissionModalOpen(false)} className="p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white">
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1 p-2 rounded-lg bg-black/40 border border-white/5 flex items-center gap-2">
                                        <Mail size={12} className="text-zinc-500" />
                                        <span className="text-[10px] text-zinc-300 truncate">{selectedStaff.email}</span>
                                    </div>
                                    <div className="flex-1 p-2 rounded-lg bg-black/40 border border-white/5 flex items-center gap-2">
                                        <Phone size={12} className="text-zinc-500" />
                                        <span className="text-[10px] text-zinc-300">{selectedStaff.phone}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="p-4 space-y-1">
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 mb-2 mt-2">Core Access</h3>
                                <PermissionRow
                                    label="Exam Creation"
                                    description="Create and edit exam papers"
                                    enabled={selectedStaff.permissions.examCreation}
                                    onChange={() => { }}
                                />
                                <PermissionRow
                                    label="Report Distribution"
                                    description="Send reports to parents"
                                    enabled={selectedStaff.permissions.reportSending}
                                    onChange={() => { }}
                                />
                                <div className="h-px bg-white/5 my-2" />
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 mb-2 mt-1">Admin Access</h3>
                                <PermissionRow
                                    label="Payment Management"
                                    description="Process tuition and refunds"
                                    enabled={selectedStaff.permissions.payment}
                                    onChange={() => { }}
                                />
                                <PermissionRow
                                    label="System Settings"
                                    description="Configure global platform settings"
                                    enabled={selectedStaff.permissions.system}
                                    onChange={() => { }}
                                />
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 bg-zinc-900/50 border-t border-white/5 flex justify-end">
                                <button onClick={() => setIsPermissionModalOpen(false)} className="px-6 py-2.5 bg-white text-black text-xs font-bold rounded-xl hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all">
                                    Save Changes
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
