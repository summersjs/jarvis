"use client";

import Link from "next/link";
import { type ComponentType, type ReactNode, useCallback, useEffect, useState } from "react";
import {
  DollarSign,
  Fuel,
  HandCoins,
  HeartPulse,
  ShoppingCart,
  TrendingDown,
  Wallet,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_JARVIS_API_KEY || "";
const USER_ID = "john";

type FinanceSummary = {
  status: string;
  month: string;
  budget: MonthlyBudget;
  transactions: Transaction[];
  dashboard_cards: {
    food_budget_remaining_week: number;
    eating_out_budget_remaining_week: number;
    total_food_over_under: number;
    spending_status: string;
  };
  weekly_food_budget: {
    monthly_grocery_budget: number;
    monthly_eating_out_budget: number;
    weekly_grocery_target: number;
    weekly_eating_out_target: number;
    weekly_total_food_target: number;
    actual_grocery_spend_this_week: number;
    actual_eating_out_spend_this_week: number;
    total_actual_food_spend_this_week: number;
    over_under_amount: number;
  };
  summary: {
    month_income: number;
    fixed_bills: number;
    variable_categories: Record<string, number>;
    days_in_month: number;
    food_transactions_count: number;
  };
};

type MonthlyBudget = {
  user_id: string;
  month: string;
  income: number;
  fixed_bills: number;
  groceries_budget: number;
  eating_out_budget: number;
  gas_budget: number;
  kids_family_budget: number;
  debt_budget: number;
  miscellaneous_budget: number;
  variable_categories: Record<string, number>;
};

type Transaction = {
  id: string;
  date: string;
  amount: number;
  category: string;
  store_vendor: string;
  notes?: string | null;
  linked_to_meal_plan: boolean;
};

type BudgetForm = {
  month: string;
  income: string;
  fixed_bills: string;
  groceries_budget: string;
  eating_out_budget: string;
  gas_budget: string;
  kids_family_budget: string;
  debt_budget: string;
  miscellaneous_budget: string;
  variable_categories_text: string;
};

type TransactionForm = {
  date: string;
  amount: string;
  category: string;
  store_vendor: string;
  notes: string;
  linked_to_meal_plan: boolean;
};

const defaultBudgetForm = (): BudgetForm => ({
  month: currentMonth(),
  income: "",
  fixed_bills: "",
  groceries_budget: "",
  eating_out_budget: "",
  gas_budget: "",
  kids_family_budget: "",
  debt_budget: "",
  miscellaneous_budget: "",
  variable_categories_text: "{}",
});

const defaultTransactionForm = (): TransactionForm => ({
  date: currentDate(),
  amount: "",
  category: "Groceries",
  store_vendor: "",
  notes: "",
  linked_to_meal_plan: false,
});

export default function FinanceOpsPage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [budgetForm, setBudgetForm] = useState<BudgetForm>(defaultBudgetForm);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(defaultTransactionForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);

  const loadSummary = useCallback(async (monthOverride?: string) => {
    const month = monthOverride || budgetForm.month || currentMonth();
    try {
      const res = await fetch(`${API_BASE}/finance/ops?user_id=${USER_ID}&month=${month}`, {
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load finance summary.");
      setSummary(data);
      setBudgetForm((prev) => fromSummary(data, prev.month || month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance summary.");
    }
  }, [budgetForm.month]);

  async function saveBudget() {
    setError("");
    setMessage("");
    setIsSavingBudget(true);

    try {
      const res = await fetch(`${API_BASE}/finance/budgets`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify(toBudgetPayload(budgetForm)),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save budget.");

      setMessage("Budget saved.");
      await loadSummary(budgetForm.month);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save budget.");
    } finally {
      setIsSavingBudget(false);
    }
  }

  async function saveTransaction() {
    setError("");
    setMessage("");
    setIsSavingTransaction(true);

    try {
      const res = await fetch(`${API_BASE}/finance/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          user_id: USER_ID,
          date: transactionForm.date,
          amount: Number(transactionForm.amount),
          category: transactionForm.category,
          store_vendor: transactionForm.store_vendor,
          notes: transactionForm.notes || null,
          linked_to_meal_plan: transactionForm.linked_to_meal_plan,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save transaction.");

      setMessage("Transaction saved.");
      setTransactionForm(defaultTransactionForm());
      await loadSummary(budgetForm.month);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transaction.");
    } finally {
      setIsSavingTransaction(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-green-400">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-green-500/70">
              Jarvis Finance Ops
            </p>
            <h1 className="mt-2 text-4xl font-bold">Finance Ops</h1>
            <p className="mt-3 text-green-300/80">
              Budget control, food spend tracking, and transaction logging.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            <Link href="/" className="command-nav-link">
              Command Center
            </Link>
            <Link href="/daily-debrief" className="command-nav-link">
              Daily Debrief
            </Link>
            <Link href="/meal-planner" className="command-nav-link">
              Meal Planner
            </Link>
            <Link href="/shopping" className="command-nav-link">
              Shopping
            </Link>
          </nav>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
            {message}
          </div>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <Metric icon={Wallet} label="Food budget remaining this week" value={`$${money(summary?.dashboard_cards.food_budget_remaining_week)}`} />
          <Metric icon={ShoppingCart} label="Eating out remaining this week" value={`$${money(summary?.dashboard_cards.eating_out_budget_remaining_week)}`} />
          <Metric icon={TrendingDown} label="Total food over/under" value={`$${money(summary?.dashboard_cards.total_food_over_under)}`} />
          <Metric icon={DollarSign} label="Spending status" value={summary?.dashboard_cards.spending_status || "WATCH"} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <section className="hud-panel">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/30 bg-black text-green-300">
                <HandCoins className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-semibold">Monthly Budget</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Month">
                <input
                  type="month"
                  value={budgetForm.month}
                  onChange={(e) => {
                    const month = e.target.value;
                    setBudgetForm((prev) => ({ ...prev, month }));
                    loadSummary(month);
                  }}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <Field label="Income">
                <input
                  type="number"
                  value={budgetForm.income}
                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, income: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <Field label="Fixed bills">
                <input
                  type="number"
                  value={budgetForm.fixed_bills}
                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, fixed_bills: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <Field label="Groceries budget">
                <input
                  type="number"
                  value={budgetForm.groceries_budget}
                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, groceries_budget: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <Field label="Eating out budget">
                <input
                  type="number"
                  value={budgetForm.eating_out_budget}
                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, eating_out_budget: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <Field label="Gas">
                <input
                  type="number"
                  value={budgetForm.gas_budget}
                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, gas_budget: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <Field label="Kids / family">
                <input
                  type="number"
                  value={budgetForm.kids_family_budget}
                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, kids_family_budget: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <Field label="Debt">
                <input
                  type="number"
                  value={budgetForm.debt_budget}
                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, debt_budget: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <Field label="Miscellaneous">
                <input
                  type="number"
                  value={budgetForm.miscellaneous_budget}
                  onChange={(e) => setBudgetForm((prev) => ({ ...prev, miscellaneous_budget: e.target.value }))}
                  className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Variable categories JSON">
                  <textarea
                    value={budgetForm.variable_categories_text}
                    onChange={(e) => setBudgetForm((prev) => ({ ...prev, variable_categories_text: e.target.value }))}
                    rows={4}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3 font-mono text-sm"
                    placeholder='{"kids": 100, "travel": 50}'
                  />
                </Field>
              </div>
            </div>

            <button
              onClick={saveBudget}
              disabled={isSavingBudget}
              className="mt-4 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 font-semibold transition hover:bg-green-500/20 disabled:opacity-50"
            >
              {isSavingBudget ? "Saving Budget..." : "Save Monthly Budget"}
            </button>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <InfoBlock
                title="Weekly grocery target"
                value={`$${money(summary?.weekly_food_budget.weekly_grocery_target)}`}
                icon={HeartPulse}
              />
              <InfoBlock
                title="Weekly eating out target"
                value={`$${money(summary?.weekly_food_budget.weekly_eating_out_target)}`}
                icon={ShoppingCart}
              />
              <InfoBlock
                title="Weekly total food target"
                value={`$${money(summary?.weekly_food_budget.weekly_total_food_target)}`}
                icon={Wallet}
              />
              <InfoBlock
                title="Over / under"
                value={`$${money(summary?.weekly_food_budget.over_under_amount)}`}
                icon={TrendingDown}
              />
            </div>
          </section>

          <section className="space-y-6">
            <div className="hud-panel">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/30 bg-black text-green-300">
                  <Fuel className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-semibold">Transactions</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Date">
                  <input
                    type="date"
                    value={transactionForm.date}
                    onChange={(e) => setTransactionForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <Field label="Amount">
                  <input
                    type="number"
                    step="0.01"
                    value={transactionForm.amount}
                    onChange={(e) => setTransactionForm((prev) => ({ ...prev, amount: e.target.value }))}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <Field label="Category">
                  <select
                    value={transactionForm.category}
                    onChange={(e) => setTransactionForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  >
                    <option>Groceries</option>
                    <option>Eating Out</option>
                    <option>Gas</option>
                    <option>Kids/Family</option>
                    <option>Debt</option>
                    <option>Miscellaneous</option>
                    <option>Other</option>
                  </select>
                </Field>
                <Field label="Store / vendor">
                  <input
                    value={transactionForm.store_vendor}
                    onChange={(e) => setTransactionForm((prev) => ({ ...prev, store_vendor: e.target.value }))}
                    className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Notes">
                    <textarea
                      value={transactionForm.notes}
                      onChange={(e) => setTransactionForm((prev) => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-green-500/30 bg-black px-4 py-3"
                    />
                  </Field>
                </div>
                <ToggleField
                  label="Linked to meal plan?"
                  checked={transactionForm.linked_to_meal_plan}
                  onChange={(value) => setTransactionForm((prev) => ({ ...prev, linked_to_meal_plan: value }))}
                />
              </div>

              <button
                onClick={saveTransaction}
                disabled={isSavingTransaction}
                className="mt-4 w-full rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 font-semibold transition hover:bg-green-500/20 disabled:opacity-50"
              >
                {isSavingTransaction ? "Saving Transaction..." : "Save Transaction"}
              </button>
            </div>

            <div className="hud-panel">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/30 bg-black text-green-300">
                  <DollarSign className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-semibold">This Month</h2>
              </div>

              <div className="space-y-3">
                {(summary?.transactions || []).slice(0, 10).map((transaction) => (
                  <div key={transaction.id} className="hud-row items-start gap-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-green-100">
                          {transaction.store_vendor || transaction.category}
                        </p>
                        <p className="text-sm text-green-300/70">
                          {transaction.date} · {transaction.category}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-green-200">
                        ${money(transaction.amount)}
                      </p>
                    </div>
                    {transaction.notes && <p className="mt-2 text-sm text-green-300/70">{transaction.notes}</p>}
                  </div>
                ))}
                {(summary?.transactions || []).length === 0 && (
                  <p className="text-sm text-green-300/60">No transactions logged yet.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function fromSummary(summary: FinanceSummary, month: string): BudgetForm {
  return {
    month,
    income: String(summary.budget?.income ?? ""),
    fixed_bills: String(summary.budget?.fixed_bills ?? ""),
    groceries_budget: String(summary.budget?.groceries_budget ?? ""),
    eating_out_budget: String(summary.budget?.eating_out_budget ?? ""),
    gas_budget: String(summary.budget?.gas_budget ?? ""),
    kids_family_budget: String(summary.budget?.kids_family_budget ?? ""),
    debt_budget: String(summary.budget?.debt_budget ?? ""),
    miscellaneous_budget: String(summary.budget?.miscellaneous_budget ?? ""),
    variable_categories_text: JSON.stringify(summary.budget?.variable_categories || {}, null, 2),
  };
}

function toBudgetPayload(form: BudgetForm) {
  let variableCategories: Record<string, number> = {};
  try {
    variableCategories = JSON.parse(form.variable_categories_text || "{}");
  } catch {
    variableCategories = {};
  }

  return {
    user_id: USER_ID,
    month: form.month,
    income: numberOrZero(form.income),
    fixed_bills: numberOrZero(form.fixed_bills),
    groceries_budget: numberOrZero(form.groceries_budget),
    eating_out_budget: numberOrZero(form.eating_out_budget),
    gas_budget: numberOrZero(form.gas_budget),
    kids_family_budget: numberOrZero(form.kids_family_budget),
    debt_budget: numberOrZero(form.debt_budget),
    miscellaneous_budget: numberOrZero(form.miscellaneous_budget),
    variable_categories: variableCategories,
  };
}

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function money(value?: number) {
  return (value ?? 0).toFixed(2);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-green-300/80">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-green-500/20 bg-black px-4 py-3">
      <span className="text-green-100">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="hud-row items-start gap-4">
      <div className="hud-row-icon">
        <Icon className="h-5 w-5 text-green-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-[0.25em] text-green-500/70">{label}</p>
        <p className="mt-3 text-2xl font-bold text-green-100">{value}</p>
      </div>
    </div>
  );
}

function InfoBlock({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="hud-row items-start gap-3">
      <div className="hud-row-icon">
        <Icon className="h-4 w-4 text-green-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-[0.22em] text-green-500/60">{title}</p>
        <p className="mt-2 text-xl font-bold text-green-100">{value}</p>
      </div>
    </div>
  );
}
