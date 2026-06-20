"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Building2,
    MapPin,
    Plus,
    Pencil,
    Phone,
    Mail,
    X,
    Loader2,
    Save,
    CheckCircle,
    Handshake,
    Crown,
    Briefcase,
} from "lucide-react";
import { PermissionButton } from "@/components/ui/permission-button";

export interface Branch {
    id: string;
    branch_code: string;
    branch_name: string;
    branch_name_en: string | null;
    ownership_type: "owned" | "jv" | "managed";
    jv_partner_name: string | null;
    jv_share_pct: number | null;
    phone: string | null;
    address: string | null;
    email: string | null;
    tax_id: string | null;
    is_active: boolean;
    sort_order: number;
    created_at: string;
}

const OWNERSHIP_LABEL: Record<Branch["ownership_type"], string> = {
    owned: "เจ้าของเอง",
    jv: "ร่วมทุน (JV)",
    managed: "รับจ้างบริหาร",
};

const OWNERSHIP_COLOR: Record<Branch["ownership_type"], string> = {
    owned: "bg-emerald-100 text-emerald-700",
    jv: "bg-amber-100 text-amber-700",
    managed: "bg-blue-100 text-blue-700",
};

const OWNERSHIP_ICON: Record<Branch["ownership_type"], React.ReactNode> = {
    owned: <Crown className="h-3 w-3" />,
    jv: <Handshake className="h-3 w-3" />,
    managed: <Briefcase className="h-3 w-3" />,
};

export default function BranchesClient({ initialBranches }: { initialBranches: Branch[] }) {
    const [branches, setBranches] = useState<Branch[]>(initialBranches);
    const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
    const [editing, setEditing] = useState<Branch | null>(null);

    function openCreate() {
        setEditing(null);
        setModalMode("create");
    }

    function openEdit(b: Branch) {
        setEditing(b);
        setModalMode("edit");
    }

    function closeModal() {
        setModalMode(null);
        setEditing(null);
    }

    function handleSaved(saved: Branch) {
        setBranches((prev) => {
            const idx = prev.findIndex((b) => b.id === saved.id);
            if (idx === -1) return [...prev, saved];
            const next = [...prev];
            next[idx] = saved;
            return next;
        });
        closeModal();
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
            {/* Header — premium */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                        สาขา <span className="text-gradient">(Branches)</span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">จัดการสาขาทั้งหมดของคลินิก</p>
                </div>
                <PermissionButton
                    permKey="branches.manage"
                    onClick={openCreate}
                    className="rounded-xl gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30 transition-all"
                >
                    <Plus className="h-4 w-4" /> เพิ่มสาขา
                </PermissionButton>
            </div>

            {/* List */}
            {branches.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-2">
                    <CardContent className="p-10 text-center">
                        <MapPin className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                        <h3 className="font-semibold text-foreground mb-1">ยังไม่มีสาขา</h3>
                        <p className="text-sm text-muted-foreground mb-4">กดปุ่ม &quot;เพิ่มสาขา&quot; เพื่อสร้างสาขาแรก</p>
                        <PermissionButton permKey="branches.manage" onClick={openCreate} className="rounded-xl gap-2 bg-cyan-600 hover:bg-cyan-700 text-white">
                            <Plus className="h-4 w-4" /> เพิ่มสาขา
                        </PermissionButton>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {branches.map((b) => (
                        <div key={b.id} className="gonix-card-premium overflow-hidden">
                            <div className="p-6">
                                <div className="flex justify-between items-start gap-3 mb-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                                {b.branch_code}
                                            </span>
                                            {!b.is_active && (
                                                <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-500">
                                                    ปิดสาขา
                                                </Badge>
                                            )}
                                        </div>
                                        <h3 className="font-semibold text-slate-800 truncate">{b.branch_name}</h3>
                                        {b.branch_name_en && (
                                            <p className="text-xs text-slate-500 truncate">{b.branch_name_en}</p>
                                        )}
                                    </div>
                                    <PermissionButton
                                        permKey="branches.manage"
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-lg h-8 w-8 p-0 shrink-0"
                                        onClick={() => openEdit(b)}
                                        title="แก้ไข"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </PermissionButton>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                    <Badge
                                        variant="secondary"
                                        className={`text-xs px-2 py-0.5 rounded-md border-0 inline-flex items-center gap-1 ${OWNERSHIP_COLOR[b.ownership_type]}`}
                                    >
                                        {OWNERSHIP_ICON[b.ownership_type]}
                                        {OWNERSHIP_LABEL[b.ownership_type]}
                                    </Badge>
                                    {b.ownership_type === "jv" && b.jv_share_pct != null && (
                                        <span className="text-xs text-amber-700">
                                            แบ่ง {b.jv_share_pct}% ให้ {b.jv_partner_name || "partner"}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-1.5 text-sm text-slate-600">
                                    {b.address && (
                                        <div className="flex items-start gap-2">
                                            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                                            <span className="text-xs leading-relaxed">{b.address}</span>
                                        </div>
                                    )}
                                    {b.phone && (
                                        <div className="flex items-center gap-2">
                                            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span className="text-xs">{b.phone}</span>
                                        </div>
                                    )}
                                    {b.email && (
                                        <div className="flex items-center gap-2">
                                            <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span className="text-xs">{b.email}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {modalMode && (
                <BranchFormModal
                    mode={modalMode}
                    initial={editing}
                    onClose={closeModal}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Modal Form
// ─────────────────────────────────────────────────────────────

function BranchFormModal({
    mode,
    initial,
    onClose,
    onSaved,
}: {
    mode: "create" | "edit";
    initial: Branch | null;
    onClose: () => void;
    onSaved: (b: Branch) => void;
}) {
    const router = useRouter();
    const supabase = createClient();

    const [branchCode, setBranchCode] = useState(initial?.branch_code || "");
    const [branchName, setBranchName] = useState(initial?.branch_name || "");
    const [branchNameEn, setBranchNameEn] = useState(initial?.branch_name_en || "");
    const [ownershipType, setOwnershipType] = useState<Branch["ownership_type"]>(initial?.ownership_type || "owned");
    const [jvPartnerName, setJvPartnerName] = useState(initial?.jv_partner_name || "");
    const [jvSharePct, setJvSharePct] = useState(initial?.jv_share_pct?.toString() || "");
    const [phone, setPhone] = useState(initial?.phone || "");
    const [email, setEmail] = useState(initial?.email || "");
    const [address, setAddress] = useState(initial?.address || "");
    const [taxId, setTaxId] = useState(initial?.tax_id || "");
    const [isActive, setIsActive] = useState(initial?.is_active ?? true);

    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    async function handleSave() {
        if (!branchCode.trim() || !branchName.trim()) {
            setError("กรุณากรอก รหัสสาขา และ ชื่อสาขา");
            return;
        }
        if (ownershipType === "jv" && !jvPartnerName.trim()) {
            setError("สาขา JV ต้องระบุชื่อ Partner");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const payload = {
                branch_code: branchCode.trim(),
                branch_name: branchName.trim(),
                branch_name_en: branchNameEn.trim() || null,
                ownership_type: ownershipType,
                jv_partner_name: ownershipType === "jv" ? jvPartnerName.trim() || null : null,
                jv_share_pct: ownershipType === "jv" && jvSharePct ? parseFloat(jvSharePct) : null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                address: address.trim() || null,
                tax_id: taxId.trim() || null,
                is_active: isActive,
            };

            if (mode === "create") {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Unauthorized");

                const { data: profile } = await supabase
                    .from("profiles")
                    .select("clinic_id")
                    .eq("id", user.id)
                    .single();
                if (!profile?.clinic_id) throw new Error("ไม่พบ clinic_id");

                const { data, error: insertErr } = await supabase
                    .from("branches")
                    .insert({ ...payload, clinic_id: profile.clinic_id })
                    .select()
                    .single();
                if (insertErr) throw insertErr;

                setSaved(true);
                setTimeout(() => {
                    onSaved(data as Branch);
                    router.refresh();
                }, 700);
            } else {
                if (!initial) throw new Error("Missing branch to edit");
                const { data, error: updateErr } = await supabase
                    .from("branches")
                    .update(payload)
                    .eq("id", initial.id)
                    .select()
                    .single();
                if (updateErr) throw updateErr;

                setSaved(true);
                setTimeout(() => {
                    onSaved(data as Branch);
                    router.refresh();
                }, 700);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div
                className="gonix-glass rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/40 bg-gradient-to-r from-cyan-50/60 to-blue-50/40">
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-blue-700" strokeWidth={2.5} />
                        </div>
                        {mode === "create" ? "เพิ่มสาขาใหม่" : "แก้ไขสาขา"}
                    </h2>
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded-lg hover:bg-white/60">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Code + Name */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-red-500">*รหัสสาขา</Label>
                            <Input
                                value={branchCode}
                                onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                                placeholder="CNX01"
                                className="font-mono"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-red-500">*ชื่อสาขา (ภาษาไทย)</Label>
                            <Input
                                value={branchName}
                                onChange={(e) => setBranchName(e.target.value)}
                                placeholder="เช่น สำนักงานใหญ่"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-slate-700">ชื่อสาขา (ภาษาอังกฤษ)</Label>
                        <Input
                            value={branchNameEn}
                            onChange={(e) => setBranchNameEn(e.target.value)}
                            placeholder="e.g. Tanavej Clinic — Headquarters"
                        />
                    </div>

                    {/* Ownership */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-slate-700">ประเภทการเป็นเจ้าของ</Label>
                            <select
                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                value={ownershipType}
                                onChange={(e) => setOwnershipType(e.target.value as Branch["ownership_type"])}
                            >
                                <option value="owned">เจ้าของเอง (Owned)</option>
                                <option value="jv">ร่วมทุน (Joint Venture)</option>
                                <option value="managed">รับจ้างบริหาร (Managed)</option>
                            </select>
                        </div>
                        {ownershipType === "jv" && (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-red-500">*ชื่อ Partner (JV)</Label>
                                    <Input
                                        value={jvPartnerName}
                                        onChange={(e) => setJvPartnerName(e.target.value)}
                                        placeholder="เช่น คุณหมอสมชาย"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-slate-700">% แบ่งให้ Partner</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        value={jvSharePct}
                                        onChange={(e) => setJvSharePct(e.target.value)}
                                        placeholder="เช่น 30.00"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Contact */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-slate-700">เบอร์โทร</Label>
                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="053-XXX-XXXX" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-slate-700">อีเมล</Label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="branch@clinic.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-slate-700">ที่อยู่</Label>
                        <Textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="ที่อยู่เต็มของสาขา"
                            rows={2}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-slate-700">เลขผู้เสียภาษี (ถ้าต่างจากคลินิกหลัก)</Label>
                            <Input
                                value={taxId}
                                onChange={(e) => setTaxId(e.target.value)}
                                placeholder="0-0000-00000-00-0"
                                className="font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-slate-700">สถานะ</Label>
                            <label className="flex items-center gap-2 h-10 px-3 rounded-md border border-input cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                />
                                <span className="text-sm">เปิดใช้งานสาขานี้</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/40 bg-white/40 backdrop-blur-sm">
                    <Button variant="outline" className="rounded-xl px-5 bg-white/60 hover:bg-white" onClick={onClose} disabled={loading}>
                        ยกเลิก
                    </Button>
                    <Button
                        className="rounded-xl px-6 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white gap-2 shadow-lg shadow-cyan-500/25"
                        onClick={handleSave}
                        disabled={loading}
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : saved ? (
                            <CheckCircle className="h-4 w-4" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {saved ? "บันทึกสำเร็จ" : mode === "create" ? "เพิ่มสาขา" : "บันทึก"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
