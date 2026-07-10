"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Plus, Pencil, Trash2, AlertCircle, CheckCircle,
    X, Eye, EyeOff, Stethoscope, UserCircle2, DoorOpen, Save, IdCard,
} from "lucide-react";
import {
    type Room, type RoomColor, ROOM_COLOR_STYLES, ROOM_TYPE_LABEL,
    ROOM_TYPE_OPTIONS, ROOM_COLOR_OPTIONS,
} from "@/lib/room-types";
import { SERVICE_LABEL, type ServiceCategory } from "@/lib/visit-service-types";
import { createRoom, updateRoom, deleteRoom, setStaffLicense, type RoomInput, type DoctorOption } from "@/lib/actions/rooms";

const SERVICE_CHOICES: ServiceCategory[] = ["general_med", "aesthetic", "wound_care", "med_cert", "checkup", "std_test"];

const ROLE_PREFIX_SHORT: Record<string, string> = {
    doctor: "นพ./พญ.",
    dentist: "ทพ./ทพญ.",
    physio: "นักกายภาพ",
    owner: "เจ้าของ",
};

export default function RoomsClient({
    initialRooms,
    availableDoctors,
}: {
    initialRooms: Room[];
    availableDoctors: DoctorOption[];
}) {
    const doctorById = Object.fromEntries(availableDoctors.map((d) => [d.staff_id, d]));
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Room | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);

    function openCreate() {
        setEditing(null);
        setShowForm(true);
        setError(null);
        setSuccess(null);
    }

    function openEdit(room: Room) {
        setEditing(room);
        setShowForm(true);
        setError(null);
        setSuccess(null);
    }

    function handleDelete(room: Room) {
        setError(null);
        startTransition(async () => {
            const res = await deleteRoom(room.id);
            if (!res.success) {
                setError(res.error || "ลบไม่สำเร็จ");
                return;
            }
            setSuccess(`✓ ปิดการใช้งานห้อง "${room.room_name}" แล้ว`);
            setConfirmDelete(null);
            router.refresh();
        });
    }

    return (
        <div className="space-y-5 max-w-6xl mx-auto animate-fade-in pb-12">
            {/* Sub-header — compact */}
            <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-sm font-medium text-slate-500">
                    <span className="font-bold text-blue-700">เปิดใช้งาน <span className="tabular-nums">{initialRooms.filter((r) => r.is_active).length}</span></span>
                    <span className="text-slate-300 mx-2">·</span>
                    ทั้งหมด <span className="font-bold text-slate-700 tabular-nums">{initialRooms.length}</span> ห้อง
                </p>
                <Button onClick={openCreate} className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                    <Plus className="h-4 w-4" /> เพิ่มห้องใหม่
                </Button>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0" /> {success}
                </div>
            )}

            {/* Rooms list */}
            {initialRooms.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <DoorOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <h2 className="text-base font-bold text-slate-700">ยังไม่มีห้องตรวจ</h2>
                    <p className="text-sm text-slate-500 mt-1 mb-4">เริ่มต้นด้วยการสร้างห้องตรวจห้องแรก</p>
                    <Button onClick={openCreate} className="rounded-xl gap-1.5">
                        <Plus className="h-4 w-4" /> สร้างห้องแรก
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {initialRooms.map((room) => {
                        const colorStyle = ROOM_COLOR_STYLES[room.color];
                        return (
                            <div
                                key={room.id}
                                className={`gonix-card-premium p-4 ${!room.is_active ? "opacity-50" : ""}`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`h-10 w-10 rounded-xl ${colorStyle.bg} flex items-center justify-center shrink-0`}>
                                        <Stethoscope className={`h-5 w-5 ${colorStyle.text}`} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-base font-bold text-slate-800 truncate">{room.room_name}</h3>
                                            {!room.is_active && (
                                                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                                    ปิดใช้งาน
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold">{ROOM_TYPE_LABEL[room.room_type] || room.room_type}</span>
                                            <span className="text-slate-300">·</span>
                                            <span>ลำดับ #{room.display_order}</span>
                                        </div>
                                        {room.description && (
                                            <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{room.description}</p>
                                        )}
                                        {room.service_categories.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {room.service_categories.map((sc) => (
                                                    <span
                                                        key={sc}
                                                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${colorStyle.bg} ${colorStyle.text}`}
                                                    >
                                                        {SERVICE_LABEL[sc] || sc}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {room.assigned_doctor_ids.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-0.5">
                                                    <UserCircle2 className="h-3 w-3" /> หมอประจำ
                                                </span>
                                                {room.assigned_doctor_ids.map((sid) => {
                                                    const d = doctorById[sid];
                                                    if (!d) {
                                                        return (
                                                            <span
                                                                key={sid}
                                                                className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                                                                title={`Staff ID ${sid} ไม่พบในระบบ — กรุณาแก้ไขห้องและเลือกหมอใหม่`}
                                                            >
                                                                ⚠ ไม่พบ
                                                            </span>
                                                        );
                                                    }
                                                    return (
                                                        <span
                                                            key={sid}
                                                            className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                                                        >
                                                            {ROLE_PREFIX_SHORT[d.role] && <span className="text-slate-400 mr-0.5">{ROLE_PREFIX_SHORT[d.role]}</span>}
                                                            {d.name}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-200/60">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="rounded-lg gap-1 text-xs h-8"
                                        onClick={() => openEdit(room)}
                                    >
                                        <Pencil className="h-3.5 w-3.5" /> แก้ไข
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="rounded-lg gap-1 text-xs h-8"
                                        onClick={() =>
                                            startTransition(async () => {
                                                const res = await updateRoom(room.id, { is_active: !room.is_active });
                                                if (!res.success) setError(res.error || "Error");
                                                else router.refresh();
                                            })
                                        }
                                    >
                                        {room.is_active ? (
                                            <>
                                                <EyeOff className="h-3.5 w-3.5" /> ซ่อน
                                            </>
                                        ) : (
                                            <>
                                                <Eye className="h-3.5 w-3.5" /> เปิดใช้
                                            </>
                                        )}
                                    </Button>
                                    <div className="flex-1" />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="rounded-lg gap-1 text-xs h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                                        onClick={() => setConfirmDelete(room)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> ลบ
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* เลขใบอนุญาตแพทย์ (ว.) */}
            <DoctorLicenses availableDoctors={availableDoctors} />

            {/* Form modal */}
            {showForm && (
                <RoomFormModal
                    initial={editing}
                    availableDoctors={availableDoctors}
                    onClose={() => setShowForm(false)}
                    onSubmit={async (data) => {
                        setError(null);
                        const res = editing
                            ? await updateRoom(editing.id, data)
                            : await createRoom(data);
                        if (!res.success) {
                            setError(res.error || "Error");
                            return false;
                        }
                        setSuccess(editing ? `✓ บันทึกการแก้ไขห้อง "${data.room_name}" แล้ว` : `✓ สร้างห้อง "${data.room_name}" สำเร็จ`);
                        setShowForm(false);
                        router.refresh();
                        return true;
                    }}
                />
            )}

            {/* Confirm delete */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-3">
                        <h3 className="text-lg font-bold text-slate-900">ยืนยันลบห้อง</h3>
                        <p className="text-sm text-slate-600">
                            ห้อง <strong>{confirmDelete.room_name}</strong> จะถูกปิดการใช้งาน (Soft delete)
                            ข้อมูล visit เก่ายังคงอยู่
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={pending} className="rounded-xl">
                                ยกเลิก
                            </Button>
                            <Button
                                onClick={() => handleDelete(confirmDelete)}
                                disabled={pending}
                                className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                            >
                                {pending ? "กำลังลบ..." : "ยืนยันลบ"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function DoctorLicenses({ availableDoctors }: { availableDoctors: DoctorOption[] }) {
    const [values, setValues] = useState<Record<string, string>>(
        () => Object.fromEntries(availableDoctors.map((d) => [d.staff_id, d.license_number || ""]))
    );
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function save(staffId: string) {
        setSavingId(staffId);
        setErr(null);
        const res = await setStaffLicense(staffId, values[staffId] || "");
        setSavingId(null);
        if (!res.success) {
            setErr(res.error || "บันทึกไม่สำเร็จ");
            return;
        }
        setSavedId(staffId);
        setTimeout(() => setSavedId((c) => (c === staffId ? null : c)), 2000);
    }

    if (availableDoctors.length === 0) return null;

    return (
        <div className="gonix-card-premium p-4">
            <div className="flex items-center gap-2 mb-1">
                <IdCard className="h-4 w-4 text-cyan-600" />
                <h3 className="text-sm font-bold text-slate-800">เลขใบอนุญาตแพทย์ (ว.)</h3>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
                ใช้แสดงในใบรับรองแพทย์ · ระบบจะดึงเลข ว. อัตโนมัติตามแพทย์ที่ถูกเลือกในห้องตรวจ
            </p>
            {err && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {err}
                </div>
            )}
            <div className="space-y-2">
                {availableDoctors.map((d) => (
                    <div key={d.staff_id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                            {ROLE_PREFIX_SHORT[d.role] && <span className="text-slate-400 mr-1">{ROLE_PREFIX_SHORT[d.role]}</span>}
                            {d.name}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs text-slate-400 font-bold">ว.</span>
                            <input
                                value={values[d.staff_id] ?? ""}
                                onChange={(e) => setValues((p) => ({ ...p, [d.staff_id]: e.target.value }))}
                                placeholder="เลขที่ใบอนุญาต"
                                className="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg h-8 gap-1 text-xs"
                                disabled={savingId === d.staff_id}
                                onClick={() => save(d.staff_id)}
                            >
                                {savedId === d.staff_id ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> : <Save className="h-3.5 w-3.5" />}
                                {savingId === d.staff_id ? "..." : savedId === d.staff_id ? "แล้ว" : "บันทึก"}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RoomFormModal({
    initial, availableDoctors, onClose, onSubmit,
}: {
    initial: Room | null;
    availableDoctors: DoctorOption[];
    onClose: () => void;
    onSubmit: (data: RoomInput) => Promise<boolean>;
}) {
    const [roomName, setRoomName] = useState(initial?.room_name || "");
    const [roomType, setRoomType] = useState(initial?.room_type || "examination");
    const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>(
        initial?.service_categories || []
    );
    const [description, setDescription] = useState(initial?.description || "");
    const [displayOrder, setDisplayOrder] = useState(initial?.display_order ?? 0);
    const [color, setColor] = useState<RoomColor>(initial?.color || "blue");
    const [assignedDoctorIds, setAssignedDoctorIds] = useState<string[]>(
        initial?.assigned_doctor_ids || []
    );
    const [submitting, setSubmitting] = useState(false);

    function toggleService(sc: ServiceCategory) {
        setServiceCategories((prev) =>
            prev.includes(sc) ? prev.filter((s) => s !== sc) : [...prev, sc]
        );
    }

    function toggleDoctor(id: string) {
        setAssignedDoctorIds((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
        );
    }

    async function handleSave() {
        setSubmitting(true);
        await onSubmit({
            room_name: roomName,
            room_type: roomType,
            service_categories: serviceCategories,
            description,
            display_order: displayOrder,
            color,
            is_active: initial?.is_active ?? true,
            assigned_doctor_ids: assignedDoctorIds,
        });
        setSubmitting(false);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 my-8">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                        {initial ? "แก้ไขห้องตรวจ" : "สร้างห้องตรวจใหม่"}
                    </h3>
                    <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                {/* Room name */}
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        ชื่อห้อง *
                    </label>
                    <input
                        type="text"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        placeholder="เช่น ห้อง 1 - โรคทั่วไป"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {/* Room type */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            ประเภทห้อง
                        </label>
                        <select
                            value={roomType}
                            onChange={(e) => setRoomType(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                            {ROOM_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Display order */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            ลำดับ
                        </label>
                        <input
                            type="number"
                            value={displayOrder}
                            onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                    </div>
                </div>

                {/* Color */}
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        สีของห้อง
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {ROOM_COLOR_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setColor(opt.value)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${color === opt.value
                                    ? "ring-2 ring-offset-2 ring-blue-500 bg-blue-50"
                                    : "bg-slate-50 hover:bg-slate-100"
                                    }`}
                            >
                                <span
                                    className="h-4 w-4 rounded-full shrink-0"
                                    style={{ backgroundColor: opt.hex }}
                                />
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Service categories */}
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        ประเภทบริการที่รองรับ
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {SERVICE_CHOICES.map((sc) => {
                            const checked = serviceCategories.includes(sc);
                            return (
                                <button
                                    key={sc}
                                    type="button"
                                    onClick={() => toggleService(sc)}
                                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${checked
                                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        }`}
                                >
                                    {SERVICE_LABEL[sc]}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                        ใช้กรองรายการห้องตอนพยาบาลเลือกส่ง (ถ้าไม่เลือก = รับทุกประเภท)
                    </p>
                </div>

                {/* Assigned doctors */}
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        แพทย์ประจำห้อง
                    </label>
                    {availableDoctors.length === 0 ? (
                        <p className="text-xs text-slate-400 italic px-2 py-2 bg-slate-50 rounded-lg">
                            ยังไม่มีแพทย์ในระบบ — เพิ่มพนักงาน role &quot;doctor/dentist/physio/owner&quot; ที่หน้า Staff ก่อน
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                            {availableDoctors.map((d) => {
                                const checked = assignedDoctorIds.includes(d.staff_id);
                                return (
                                    <button
                                        key={d.staff_id}
                                        type="button"
                                        onClick={() => toggleDoctor(d.staff_id)}
                                        className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all inline-flex items-center gap-1.5 ${checked
                                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/30"
                                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                            }`}
                                    >
                                        <UserCircle2 className="h-3.5 w-3.5" />
                                        {ROLE_PREFIX_SHORT[d.role] && (
                                            <span className={checked ? "opacity-80" : "text-slate-400"}>
                                                {ROLE_PREFIX_SHORT[d.role]}
                                            </span>
                                        )}
                                        {d.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <p className="text-[11px] text-slate-500 mt-1.5">
                        แพทย์ที่ระบุจะถือเป็นหมอประจำห้อง (informational — หมอท่านอื่นยัง check-in ได้)
                    </p>
                </div>

                {/* Description */}
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        คำอธิบาย (ไม่บังคับ)
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        placeholder="เช่น ห้องตรวจคนไข้ทั่วไป มีเครื่อง EKG, ฯลฯ"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                    />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose} disabled={submitting} className="rounded-xl">
                        ยกเลิก
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={submitting || !roomName.trim()}
                        className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-md shadow-blue-500/25"
                    >
                        {submitting ? "กำลังบันทึก..." : initial ? "บันทึก" : "สร้างห้อง"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
