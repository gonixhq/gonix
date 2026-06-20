"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Save, Loader2, CheckCircle, Package } from "lucide-react";

export default function NewDrugPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess("");
        try {
            const form = new FormData(e.currentTarget);
            const get = (n: string) => (form.get(n) as string) || null;
            const getNum = (n: string) => {
                const v = form.get(n) as string;
                return v ? parseFloat(v) : null;
            };

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");
            const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
            if (!profile?.clinic_id) throw new Error("ไม่พบ clinic_id");

            const itemName = get("item_name");
            if (!itemName) throw new Error("กรุณากรอกชื่อยา");

            const { error: insertErr } = await supabase.from("inventory").insert({
                clinic_id: profile.clinic_id,
                item_name: itemName,
                generic_name: get("generic_name"),
                strength: get("strength"),
                dosage_form: get("dosage_form"),
                category: "drug",
                unit: get("unit") || "เม็ด",
                cost_per_unit: getNum("cost_per_unit"),
                selling_price: getNum("selling_price"),
                current_stock: getNum("current_stock") ?? 0,
                reorder_point: getNum("reorder_point"),
                is_active: true,
            });

            if (insertErr) throw insertErr;
            setSuccess(`เพิ่มยา "${itemName}" สำเร็จ!`);
            setTimeout(() => router.push("/dashboard/pharmacy"), 1200);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
                <Link href="/dashboard/pharmacy">
                    <Button variant="ghost" size="icon" className="rounded-xl"><ArrowLeft className="h-4 w-4" /></Button>
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-foreground">เพิ่มรายการยาใหม่</h1>
                    <p className="text-sm text-muted-foreground">กรอกข้อมูลยาเพื่อเพิ่มเข้าคลัง</p>
                </div>
            </div>

            {error && <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{error}</div>}
            {success && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{success}</div>}

            <form onSubmit={handleSubmit}>
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-violet-50/50">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Package className="h-4 w-4 text-violet-500" /> ข้อมูลยา
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5 col-span-2">
                                <Label htmlFor="item_name" className="text-primary">* ชื่อยา (Trade Name)</Label>
                                <Input id="item_name" name="item_name" required placeholder="เช่น Paracetamol 500mg" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="generic_name">ชื่อสามัญ (Generic Name)</Label>
                                <Input id="generic_name" name="generic_name" placeholder="เช่น Paracetamol" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="strength">ความแรง (Strength)</Label>
                                <Input id="strength" name="strength" placeholder="เช่น 500mg" className="rounded-xl" />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="dosage_form">รูปแบบยา</Label>
                                <select id="dosage_form" name="dosage_form"
                                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm">
                                    <option value="tablet">เม็ด (Tablet)</option>
                                    <option value="capsule">แคปซูล (Capsule)</option>
                                    <option value="syrup">น้ำเชื่อม (Syrup)</option>
                                    <option value="injection">ฉีด (Injection)</option>
                                    <option value="cream">ครีม (Cream)</option>
                                    <option value="ointment">ขี้ผึ้ง (Ointment)</option>
                                    <option value="eye_drop">ยาหยอดตา (Eye Drop)</option>
                                    <option value="inhaler">สูดพ่น (Inhaler)</option>
                                    <option value="other">อื่นๆ</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="unit">หน่วยนับ</Label>
                                <Input id="unit" name="unit" defaultValue="เม็ด" placeholder="เม็ด, ขวด, หลอด" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="current_stock">จำนวนเริ่มต้น</Label>
                                <Input id="current_stock" name="current_stock" type="number" min={0} defaultValue={0} className="rounded-xl" />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="cost_per_unit">ต้นทุน/หน่วย (฿)</Label>
                                <Input id="cost_per_unit" name="cost_per_unit" type="number" step="0.01" min={0} placeholder="0.00" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="selling_price" className="text-primary">* ราคาขาย/หน่วย (฿)</Label>
                                <Input id="selling_price" name="selling_price" type="number" step="0.01" min={0} placeholder="0.00" className="rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="reorder_point">จุดสั่งซื้อ (Reorder Point)</Label>
                                <Input id="reorder_point" name="reorder_point" type="number" min={0} placeholder="20" className="rounded-xl" />
                            </div>
                        </div>

                        <div className="flex justify-end pt-3 border-t border-border/60">
                            <Button type="submit" disabled={loading} className="rounded-xl gap-2 px-6">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                บันทึกรายการยา
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    );
}
