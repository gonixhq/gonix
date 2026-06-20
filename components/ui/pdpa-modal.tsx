"use client";

import { Button } from "@/components/ui/button";
import { ShieldCheck, X } from "lucide-react";

/**
 * PDPA Modal — shared across patient registration flows.
 * Used in: /dashboard/patients/new (admin form), /register/[clinicCode] (public form)
 */
export function PDPAModal({
    open,
    onClose,
    clinicName,
}: {
    open: boolean;
    onClose: () => void;
    clinicName: string;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-blue-600" />
                        <h2 className="text-lg font-bold text-slate-800">นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 text-[14px] leading-relaxed text-slate-700 space-y-4">
                    <p>
                        <strong>{clinicName}</strong> (ต่อไปนี้เรียกว่า &quot;คลินิก&quot;) เคารพสิทธิความเป็นส่วนตัว
                        และให้ความสำคัญต่อการคุ้มครองข้อมูลส่วนบุคคลของผู้รับบริการ
                        คลินิกจึงจัดทำเอกสารฉบับนี้ขึ้นเพื่อขอความยินยอมในการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของท่าน
                        ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (Personal Data Protection Act — PDPA)
                        พระราชบัญญัติสุขภาพแห่งชาติ พ.ศ. 2550 และกฎหมายอื่นที่เกี่ยวข้อง
                    </p>

                    <h3 className="font-bold text-slate-900 text-[15px] pt-1">1. ข้อมูลส่วนบุคคลที่จะเก็บรวบรวมและใช้</h3>
                    <p>คลินิกมีความจำเป็นต้องเก็บรวบรวมข้อมูลส่วนบุคคลของท่าน ดังต่อไปนี้</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>
                            <strong>ข้อมูลทั่วไป:</strong> ชื่อ-นามสกุล, เลขประจำตัวประชาชน/หนังสือเดินทาง, วันเดือนปีเกิด,
                            อายุ, เพศ, เชื้อชาติ, สัญชาติ, สถานภาพสมรส, อาชีพ, ที่อยู่, เบอร์โทรศัพท์, อีเมล,
                            LINE ID และข้อมูลผู้ติดต่อกรณีฉุกเฉิน
                        </li>
                        <li>
                            <strong>ข้อมูลอ่อนไหว (Sensitive Personal Data):</strong> ข้อมูลสุขภาพ, ประวัติการเจ็บป่วย,
                            โรคประจำตัว, ประวัติการแพ้ยา/แพ้อาหาร, ผลการตรวจร่างกายและตรวจทางห้องปฏิบัติการ,
                            ภาพถ่ายเพื่อการรักษา, ข้อมูลทางพันธุกรรม/ชีวภาพ (ถ้ามี) และสิทธิ์การรักษาพยาบาล
                        </li>
                    </ul>

                    <h3 className="font-bold text-slate-900 text-[15px] pt-1">2. วัตถุประสงค์ในการเก็บรวบรวม ใช้ และเปิดเผยข้อมูล</h3>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>เพื่อการตรวจวินิจฉัย วางแผนการรักษา ทำหัตถการทางการแพทย์ และการให้บริการอย่างถูกต้องและปลอดภัย</li>
                        <li>เพื่อจัดทำและบันทึกเวชระเบียน (OPD) ประวัติการรักษา และการติดตามผล</li>
                        <li>เพื่อการติดต่อสื่อสาร นัดหมาย แจ้งเตือน และติดตามอาการหลังรับบริการ</li>
                        <li>เพื่อประโยชน์ในการเบิกจ่ายค่ารักษาพยาบาล กับหน่วยงานสิทธิ์การรักษา (สปสช./ประกันสังคม/ประกันสุขภาพ)</li>
                        <li>เพื่อปฏิบัติตามกฎหมายที่เกี่ยวข้อง เช่น พ.ร.บ. สถานพยาบาล, พ.ร.บ. วิชาชีพเวชกรรม, พ.ร.บ. ควบคุมโรคติดต่อ</li>
                        <li>เพื่อการตรวจสอบคุณภาพการรักษา การวิจัยทางการแพทย์ การเรียนการสอน (โดยทำให้ข้อมูลเป็นนิรนาม)</li>
                    </ul>

                    <h3 className="font-bold text-slate-900 text-[15px] pt-1">3. การเปิดเผยข้อมูลส่วนบุคคล</h3>
                    <p>คลินิกจะเก็บรักษาข้อมูลของท่านเป็นความลับ และจะเปิดเผยข้อมูลเท่าที่จำเป็น โดยเฉพาะกับบุคคลหรือหน่วยงานดังต่อไปนี้</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>แพทย์ พยาบาล เภสัชกร และเจ้าหน้าที่ของคลินิกที่มีส่วนเกี่ยวข้องโดยตรงกับการรักษา</li>
                        <li>สถานพยาบาลอื่นในกรณีต้องส่งต่อ (Refer) เพื่อรับการรักษาต่อเนื่อง</li>
                        <li>หน่วยงานที่จ่ายค่ารักษา (สปสช., ประกันสังคม, บริษัทประกันชีวิต/สุขภาพ) ตามสิทธิ์ของท่าน</li>
                        <li>หน่วยงานราชการหรือศาล ในกรณีมีกฎหมายบังคับให้เปิดเผย หรือเพื่อป้องกันอันตรายร้ายแรงต่อชีวิตและสุขภาพ</li>
                    </ul>

                    <h3 className="font-bold text-slate-900 text-[15px] pt-1">4. ระยะเวลาการเก็บรักษาข้อมูล</h3>
                    <p>
                        คลินิกจะเก็บรักษาข้อมูลของท่านตลอดระยะเวลาที่ท่านยังเป็นผู้รับบริการ
                        และจะเก็บต่อไปอีกอย่างน้อย <strong>10 ปี</strong> นับจากวันที่รับบริการครั้งสุดท้าย
                        ตามที่กำหนดในประกาศกระทรวงสาธารณสุข เรื่อง การจัดทำและเก็บรักษาเวชระเบียน
                    </p>

                    <h3 className="font-bold text-slate-900 text-[15px] pt-1">5. สิทธิของเจ้าของข้อมูลส่วนบุคคล</h3>
                    <p>ท่านมีสิทธิดังต่อไปนี้ ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>สิทธิขอเข้าถึงและขอรับสำเนาข้อมูลส่วนบุคคลของท่าน</li>
                        <li>สิทธิขอแก้ไขข้อมูลที่ไม่ถูกต้อง / ไม่ครบถ้วน / ไม่เป็นปัจจุบัน</li>
                        <li>สิทธิขอลบ ระงับ หรือคัดค้านการประมวลผลข้อมูล</li>
                        <li>สิทธิขอโอนย้ายข้อมูลไปยังผู้ควบคุมข้อมูลส่วนบุคคลรายอื่น</li>
                        <li>สิทธิเพิกถอนความยินยอมเมื่อใดก็ได้ (โดยแจ้งเป็นลายลักษณ์อักษร)</li>
                        <li>สิทธิร้องเรียนต่อคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สำนักงาน PDPC)</li>
                    </ul>
                    <p className="text-[13px] text-slate-500 italic">
                        ทั้งนี้ การเพิกถอนความยินยอมอาจส่งผลกระทบต่อประสิทธิภาพหรือความต่อเนื่องในการรับบริการทางการแพทย์
                    </p>

                    <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200 mt-4">
                        <h3 className="font-bold text-blue-900 text-[15px] mb-2">การแสดงความยินยอม</h3>
                        <p className="text-blue-900">
                            ข้าพเจ้าได้อ่านและทำความเข้าใจรายละเอียดในเอกสารฉบับนี้โดยตลอดแล้ว
                            ข้าพเจ้ายินยอมให้ <strong>{clinicName}</strong> เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล
                            และข้อมูลสุขภาพของข้าพเจ้า ตามวัตถุประสงค์ที่ระบุไว้ข้างต้นทุกประการ
                        </p>
                    </div>

                    <p className="text-[12px] text-slate-500 pt-2 border-t border-slate-200">
                        หากท่านมีข้อสงสัยหรือต้องการใช้สิทธิตามที่กำหนดไว้ในนโยบายฉบับนี้ โปรดติดต่อคลินิกที่จุดบริการลูกค้า
                        หรือทางช่องทางการติดต่อที่ระบุไว้ที่หน้าคลินิก
                    </p>
                </div>

                <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
                    <Button onClick={onClose} className="rounded-xl h-11 px-7 text-[15px] font-bold bg-blue-600 hover:bg-blue-700 text-white">
                        ปิด
                    </Button>
                </div>
            </div>
        </div>
    );
}
