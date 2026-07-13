// Nutrition module — daily calorie log grouped by meal, plus a food catalog.
import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api.js';
import { Modal, Field, EmptyState, useToast, todayISO } from './ui.jsx';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
const MACRO_COLORS = { protein: '#6d8bff', carbs: '#f2b544', fat: '#f2734f' };

export default function Nutrition() {
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState(null);
  const [foods, setFoods] = useState([]);
  const [logging, setLogging] = useState(false);
  const [addingFood, setAddingFood] = useState(false);
  const toast = useToast();

  const loadEntries = () => api.listNutrition(date).then(setEntries).catch((e) => toast(e.message, 'error'));
  const loadFoods = () => api.listFoods().then(setFoods).catch((e) => toast(e.message, 'error'));
  useEffect(() => { loadEntries(); }, [date]);
  useEffect(() => { loadFoods(); }, []);

  const remove = async (entry) => {
    try { await api.deleteEntry(entry.id); toast('Entry removed'); loadEntries(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const totals = useMemo(() => {
    const t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const e of entries || []) {
      t.calories += e.calories; t.protein += e.protein; t.carbs += e.carbs; t.fat += e.fat;
    }
    return t;
  }, [entries]);

  const byMeal = useMemo(() => {
    const map = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const e of entries || []) (map[e.meal] || map.snack).push(e);
    return map;
  }, [entries]);

  const gramTotal = totals.protein + totals.carbs + totals.fat || 1;

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Nutrition</h2>
          <p>Log meals against a shared food catalog and watch your macros.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="date" className="btn" style={{ padding: '8px 12px' }} value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn" onClick={() => setAddingFood(true)}>Food catalog</button>
          <button className="btn primary" onClick={() => setLogging(true)}>+ Log meal</button>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <Stat label="Calories" value={Math.round(totals.calories)} unit="kcal" color="#45c98a" />
        <Stat label="Protein" value={round1(totals.protein)} unit="g" color={MACRO_COLORS.protein} />
        <Stat label="Carbs" value={round1(totals.carbs)} unit="g" color={MACRO_COLORS.carbs} />
        <Stat label="Fat" value={round1(totals.fat)} unit="g" color={MACRO_COLORS.fat} />
      </div>

      {totals.calories > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="macro-bar">
            <span style={{ width: `${(totals.protein / gramTotal) * 100}%`, background: MACRO_COLORS.protein }} />
            <span style={{ width: `${(totals.carbs / gramTotal) * 100}%`, background: MACRO_COLORS.carbs }} />
            <span style={{ width: `${(totals.fat / gramTotal) * 100}%`, background: MACRO_COLORS.fat }} />
          </div>
          <div className="macro-legend">
            {['protein', 'carbs', 'fat'].map((m) => (
              <div className="m" key={m}>
                <span className="swatch" style={{ background: MACRO_COLORS[m] }} />
                {m[0].toUpperCase() + m.slice(1)} — {round1(totals[m])}g
              </div>
            ))}
          </div>
        </div>
      )}

      {entries === null ? (
        <div className="loading">Loading…</div>
      ) : entries.length === 0 ? (
        <EmptyState icon="🍎" title="No meals logged" hint="Log your first meal for this day to track calories." />
      ) : (
        <div className="card">
          {MEALS.map((meal) => byMeal[meal].length > 0 && (
            <div className="meal-group" key={meal}>
              <h4>
                <span>{MEAL_LABEL[meal]}</span>
                <span>{Math.round(byMeal[meal].reduce((s, e) => s + e.calories, 0))} kcal</span>
              </h4>
              {byMeal[meal].map((e) => (
                <div className="row" key={e.id}>
                  <div className="grow">
                    <div className="title" style={{ fontSize: 14 }}>{e.food_name}</div>
                    <div className="meta">{e.servings}× serving · {e.protein}p / {e.carbs}c / {e.fat}f</div>
                  </div>
                  <div style={{ fontWeight: 650 }}>{e.calories}<span className="muted" style={{ fontSize: 12 }}> kcal</span></div>
                  <div className="row-actions">
                    <button className="btn ghost sm danger" onClick={() => remove(e)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {logging && (
        <LogMealForm foods={foods} date={date} onClose={() => setLogging(false)} onSaved={() => { setLogging(false); loadEntries(); }} onNeedFood={() => { setLogging(false); setAddingFood(true); }} />
      )}
      {addingFood && (
        <FoodCatalog foods={foods} onClose={() => setAddingFood(false)} onChanged={loadFoods} />
      )}
    </section>
  );
}

function Stat({ label, value, unit, color }) {
  return (
    <div className="stat">
      <div className="accent-bar" style={{ background: color }} />
      <div className="label">{label}</div>
      <div className="value">{value}<span className="unit">{unit}</span></div>
    </div>
  );
}

const round1 = (n) => Math.round(n * 10) / 10;

function LogMealForm({ foods, date, onClose, onSaved, onNeedFood }) {
  const [form, setForm] = useState({ food_id: foods[0]?.id ? String(foods[0].id) : '', meal: 'breakfast', servings: '1', date });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedFood = foods.find((f) => String(f.id) === String(form.food_id));
  const preview = selectedFood ? Math.round(selectedFood.calories * (Number(form.servings) || 0)) : 0;

  const submit = async () => {
    setSaving(true); setErrors({});
    try {
      await api.createEntry({ food_id: Number(form.food_id), date: form.date, meal: form.meal, servings: Number(form.servings) });
      toast('Meal logged'); onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.details) { setErrors(e.details); toast('Please fix the highlighted fields', 'error'); }
      else toast(e.message, 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      title="Log a meal"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving || foods.length === 0}>{saving ? 'Saving…' : 'Log meal'}</button>
        </>
      }
    >
      {foods.length === 0 ? (
        <EmptyState icon="🥕" title="No foods in the catalog" hint="Add a food first, then log it here." />
      ) : (
        <>
          <Field label="Food" name="food_id" errors={errors}>
            <select id="food_id" value={form.food_id} onChange={(e) => set('food_id', e.target.value)}>
              {foods.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.calories} kcal)</option>)}
            </select>
          </Field>
          <div className="field-row">
            <Field label="Meal" name="meal" errors={errors}>
              <select id="meal" value={form.meal} onChange={(e) => set('meal', e.target.value)}>
                {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
              </select>
            </Field>
            <Field label="Servings" name="servings" errors={errors}>
              <input id="servings" value={form.servings} onChange={(e) => set('servings', e.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <Field label="Date" name="date" errors={errors}>
            <input id="date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <p className="muted" style={{ fontSize: 13 }}>
            ≈ <strong style={{ color: 'var(--nutrition)' }}>{preview} kcal</strong> ·{' '}
            <button className="btn ghost sm" onClick={onNeedFood} style={{ padding: '2px 6px' }}>can’t find it? add a food</button>
          </p>
        </>
      )}
    </Modal>
  );
}

// Catalog manager: browse the foods you've added, remove them, and add new
// ones. Foods are the reusable reference data that meal entries point at.
function FoodCatalog({ foods, onClose, onChanged }) {
  const empty = { name: '', calories: '', protein: '', carbs: '', fat: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async () => {
    setSaving(true); setErrors({});
    try {
      await api.createFood({
        name: form.name,
        calories: Number(form.calories),
        protein: Number(form.protein) || 0,
        carbs: Number(form.carbs) || 0,
        fat: Number(form.fat) || 0,
      });
      toast('Food added to catalog');
      setForm(empty);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.details) { setErrors(e.details); toast('Please fix the highlighted fields', 'error'); }
      else toast(e.message, 'error');
    } finally { setSaving(false); }
  };

  const remove = async (food) => {
    if (!confirm(`Remove "${food.name}" from the catalog?`)) return;
    try { await api.deleteFood(food.id); toast('Food removed'); onChanged(); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Modal
      title="Food catalog"
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Done</button>}
    >
      {foods.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Your catalog is empty. Add your first food below.</p>
      ) : (
        <div style={{ maxHeight: 220, overflow: 'auto', marginBottom: 18 }}>
          {foods.map((f) => (
            <div className="row" key={f.id} style={{ padding: '9px 12px' }}>
              <div className="grow">
                <div className="title" style={{ fontSize: 14 }}>{f.name}</div>
                <div className="meta">{f.calories} kcal · {f.protein}p / {f.carbs}c / {f.fat}f</div>
              </div>
              <button className="btn ghost sm danger" onClick={() => remove(f)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <label className="ex-head" style={{ display: 'block', marginBottom: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>Add a food</label>
      <Field label="Name" name="name" errors={errors}>
        <input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Grilled Chicken (6oz)" />
      </Field>
      <div className="field-row cols-3">
        <Field label="Calories" name="calories" errors={errors}>
          <input id="calories" value={form.calories} onChange={(e) => set('calories', e.target.value)} inputMode="numeric" placeholder="280" />
        </Field>
        <Field label="Protein (g)" name="protein" errors={errors}>
          <input id="protein" value={form.protein} onChange={(e) => set('protein', e.target.value)} inputMode="decimal" placeholder="52" />
        </Field>
        <Field label="Carbs (g)" name="carbs" errors={errors}>
          <input id="carbs" value={form.carbs} onChange={(e) => set('carbs', e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
      </div>
      <Field label="Fat (g)" name="fat" errors={errors}>
        <input id="fat" value={form.fat} onChange={(e) => set('fat', e.target.value)} inputMode="decimal" placeholder="6" />
      </Field>
      <button className="btn primary" onClick={add} disabled={saving} style={{ width: '100%' }}>{saving ? 'Saving…' : '+ Add to catalog'}</button>
    </Modal>
  );
}
