/** คิดเงินเป็นสตางค์ และไม่ถือว่าต้นทุนศูนย์คือยืนยันว่าไม่มีต้นทุน */
export interface ProfitInvoice { id: string; total_amount: number | string; status: string }
export interface ProfitItem { inv_id: string; item_type: string; cogs_amount: number | string | null; df_amount: number | string | null }
export interface ProfitExpense { category: string; amount: number | string }
export function buildProfitReport(invoices: ProfitInvoice[], items: ProfitItem[], anonymous: {total_amount: number | string}[], expenses: ProfitExpense[], payments: {amount: number | string}[]) {
    const cents = (n: number | string | null) => Math.round(Number(n || 0) * 100);
    const valid = invoices.filter(i => !['draft', 'voided', 'refunded'].includes(i.status));
    const ids = new Set(valid.map(i => i.id));
    const costs = items.filter(i => ids.has(i.inv_id));
    const regularSales = valid.reduce((s, i) => s + cents(i.total_amount), 0);
    const anonymousSales = anonymous.reduce((s, i) => s + cents(i.total_amount), 0);
    const groups = new Map<string, {cost: number; df: number; count: number; unverified: number}>();
    for (const i of costs) {
        const key = i.item_type || 'other';
        const g = groups.get(key) || {cost: 0, df: 0, count: 0, unverified: 0};
        g.cost += cents(i.cogs_amount); g.df += cents(i.df_amount); g.count++;
        if (cents(i.cogs_amount) <= 0) g.unverified++;
        groups.set(key, g);
    }
    const expenseGroups = new Map<string, number>();
    for (const e of expenses) expenseGroups.set(e.category || 'อื่นๆ', (expenseGroups.get(e.category || 'อื่นๆ') || 0) + cents(e.amount));
    const cogs = costs.reduce((s,i) => s + cents(i.cogs_amount), 0);
    const df = costs.reduce((s,i) => s + cents(i.df_amount), 0);
    const expense = expenses.reduce((s,i) => s + cents(i.amount), 0);
    return {
        regularSales: regularSales / 100, anonymousSales: anonymousSales / 100,
        sales: (regularSales + anonymousSales) / 100,
        cashReceived: (payments.reduce((s,p) => s + cents(p.amount), 0) + anonymousSales) / 100,
        cogs: cogs / 100, df: df / 100, expenses: expense / 100,
        unverifiedCosts: costs.filter(i => cents(i.cogs_amount) <= 0).length,
        unverifiedDf: costs.filter(i => cents(i.df_amount) <= 0).length,
        invoicesWithoutItems: valid.filter(i => !costs.some(it => it.inv_id === i.id)).length,
        anonymousCount: anonymous.length, invoiceCount: valid.length,
        packageCount: costs.filter(i => i.item_type === 'package').length,
        costs: [...groups].map(([type,g]) => ({type, ...g, cost: g.cost / 100, df: g.df / 100})),
        expenseGroups: [...expenseGroups].map(([category, amount]) => ({category, amount: amount / 100})),
    };
}
export type ProfitReport = ReturnType<typeof buildProfitReport>;
