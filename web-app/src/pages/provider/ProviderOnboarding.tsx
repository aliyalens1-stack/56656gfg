import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Wrench, MapPin, Calendar, FileCheck, CheckCircle2, ArrowLeft, ArrowRight, Plus, X } from 'lucide-react';
import api from '../../services/api';

const STEPS = [
  { n: 1, title: 'Данные СТО',     icon: Building2 },
  { n: 2, title: 'Услуги',          icon: Wrench },
  { n: 3, title: 'Зона работы',     icon: MapPin },
  { n: 4, title: 'График',          icon: Calendar },
  { n: 5, title: 'Документы',       icon: FileCheck },
  { n: 6, title: 'Готово',          icon: CheckCircle2 },
];

const SERVICES = ['Диагностика', 'Замена масла', 'Тормоза', 'Подвеска', 'Электрика', 'Шиномонтаж', 'Двигатель', 'Кондиционер', 'Кузов', 'Эвакуатор'];
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function ProviderOnboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<any>({
    name: '', phone: '', email: '', city: 'Киев', address: '',
    services: [],
    zoneRadiusKm: 8, zoneCenter: 'Центр',
    workDays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'],
    workHours: { from: '09:00', to: '19:00' },
    docFiles: [],
  });

  const set = (k: string, v: any) => setData((d: any) => ({ ...d, [k]: v }));
  const toggleArr = (key: string, val: any) => setData((d: any) => ({
    ...d,
    [key]: d[key].includes(val) ? d[key].filter((x: any) => x !== val) : [...d[key], val],
  }));

  const next = async () => {
    if (step === 5) {
      setSubmitting(true);
      try { await api.post('/provider/onboarding/submit', data); } catch {}
      setSubmitting(false);
    }
    setStep(s => Math.min(6, s + 1));
  };
  const back = () => setStep(s => Math.max(1, s - 1));

  const canNext =
    (step === 1 && data.name && data.phone && data.email) ||
    (step === 2 && data.services.length > 0) ||
    (step === 3 && data.zoneRadiusKm > 0) ||
    (step === 4 && data.workDays.length > 0) ||
    step >= 5;

  return (
    <div className="max-w-[900px] mx-auto px-4 lg:px-8 py-8 space-y-6">
      <div>
        <div className="slash-label mb-2">СТАТЬ МАСТЕРОМ</div>
        <h1 className="font-display tracking-bebas text-4xl md:text-5xl">
          ОНБОРДИНГ <span className="text-amber">ЗА 6 ШАГОВ</span>
        </h1>
        <p className="text-sm mt-2" style={{ color: '#B8B8B8' }}>Подключение за 24 часа после проверки.</p>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-6 gap-2" data-testid="stepper">
        {STEPS.map(s => {
          const Icon = s.icon;
          const active = step === s.n;
          const done = step > s.n;
          return (
            <div
              key={s.n}
              className={`card !p-3 flex flex-col items-center gap-1.5 text-center transition-colors ${
                active ? '!border-amber' : ''
              }`}
              style={active ? { borderColor: '#FFB020' } : undefined}
              data-testid={`step-${s.n}`}
            >
              <span className={`icon-badge-soft !w-9 !h-9 ${done ? '!bg-amber !text-black' : ''}`}>
                {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
              </span>
              <span className="text-2xs uppercase tracking-widest font-bold hidden md:block" style={{ color: active ? '#FFB020' : '#8A8A8A' }}>
                {s.title}
              </span>
              <span className="md:hidden text-2xs">{s.n}</span>
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="card-elevated">
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4" data-testid="step1">
            <h2 className="font-display tracking-bebas text-2xl">ОСНОВНЫЕ ДАННЫЕ</h2>
            <Field label="Название СТО / мастер" testId="o-name" value={data.name} onChange={v => set('name', v)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Телефон"     testId="o-phone" value={data.phone} onChange={v => set('phone', v)} placeholder="+380 ..." />
              <Field label="Email"       testId="o-email" type="email" value={data.email} onChange={v => set('email', v)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldSelect label="Город" testId="o-city" value={data.city} onChange={v => set('city', v)} options={['Киев', 'Львов', 'Одесса', 'Харьков', 'Днепр']} />
              <Field label="Адрес"       testId="o-addr" value={data.address} onChange={v => set('address', v)} placeholder="ул. Автомобильная, 42" />
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4" data-testid="step2">
            <h2 className="font-display tracking-bebas text-2xl">УСЛУГИ ({data.services.length})</h2>
            <p className="text-sm" style={{ color: '#B8B8B8' }}>Выберите типы услуг, которые вы выполняете</p>
            <div className="flex flex-wrap gap-2">
              {SERVICES.map(s => (
                <button key={s} onClick={() => toggleArr('services', s)} className={`chip ${data.services.includes(s) ? 'chip-active' : ''}`} data-testid={`svc-${s}`}>
                  {data.services.includes(s) ? '✓ ' : ''}{s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4" data-testid="step3">
            <h2 className="font-display tracking-bebas text-2xl">ЗОНА РАБОТЫ</h2>
            <FieldSelect label="Центральная зона" testId="o-zone" value={data.zoneCenter} onChange={v => set('zoneCenter', v)} options={['Центр', 'Подол', 'Печерск', 'Левый берег', 'Оболонь', 'Соломенский', 'Святошинский']} />
            <div>
              <label className="text-2xs uppercase tracking-widest font-bold block mb-2" style={{ color: '#8A8A8A' }}>Радиус выезда (км)</label>
              <div className="flex items-center justify-between mb-2">
                <span style={{ color: '#8A8A8A' }} className="text-xs">1 км</span>
                <span className="font-display tracking-bebas text-3xl text-amber">{data.zoneRadiusKm} км</span>
                <span style={{ color: '#8A8A8A' }} className="text-xs">30 км</span>
              </div>
              <input type="range" min={1} max={30} step={1} value={data.zoneRadiusKm} onChange={e => set('zoneRadiusKm', Number(e.target.value))} className="w-full accent-amber" data-testid="o-radius" />
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="space-y-4" data-testid="step4">
            <h2 className="font-display tracking-bebas text-2xl">РАБОЧИЙ ГРАФИК</h2>
            <div>
              <label className="text-2xs uppercase tracking-widest font-bold block mb-2" style={{ color: '#8A8A8A' }}>Дни</label>
              <div className="flex gap-2">
                {DAYS.map(d => (
                  <button key={d} onClick={() => toggleArr('workDays', d)} className={`chip ${data.workDays.includes(d) ? 'chip-active' : ''}`} data-testid={`d-${d}`}>{d}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="С" testId="o-from" type="time" value={data.workHours.from} onChange={v => set('workHours', { ...data.workHours, from: v })} />
              <Field label="До" testId="o-to" type="time" value={data.workHours.to} onChange={v => set('workHours', { ...data.workHours, to: v })} />
            </div>
          </div>
        )}

        {/* Step 5 */}
        {step === 5 && (
          <div className="space-y-4" data-testid="step5">
            <h2 className="font-display tracking-bebas text-2xl">ДОКУМЕНТЫ</h2>
            <p className="text-sm" style={{ color: '#B8B8B8' }}>Загрузите документы для верификации (mock — production использует S3)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {['Свидетельство ФОП / ИП', 'Справка СТО', 'Сертификаты', 'Фото мастерской'].map(d => (
                <div key={d} className="card-interactive flex items-center gap-3 !p-4">
                  <span className="icon-badge-soft !w-9 !h-9"><Plus size={14} /></span>
                  <span className="text-sm font-semibold flex-1">{d}</span>
                  <span className="badge badge-muted">Загрузить</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 6 */}
        {step === 6 && (
          <div className="text-center py-10" data-testid="step6">
            <div className="icon-badge-soft !w-20 !h-20 mx-auto mb-6">
              <CheckCircle2 size={36} className="text-amber" />
            </div>
            <h2 className="font-display tracking-bebas text-4xl mb-2">ЗАЯВКА ПРИНЯТА</h2>
            <p className="text-sm max-w-md mx-auto mb-6" style={{ color: '#B8B8B8' }}>
              Спасибо! Мы свяжемся с вами в течение 24 часов для проверки документов и активации профиля.
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => nav('/provider')} className="btn-primary">Перейти в кабинет <ArrowRight size={14} /></button>
              <button onClick={() => nav('/')} className="btn-secondary">На главную</button>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      {step < 6 && (
        <div className="flex items-center justify-between gap-2">
          <button onClick={back} disabled={step === 1} className="btn-secondary" data-testid="nav-back">
            <ArrowLeft size={14} /> Назад
          </button>
          <span className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>Шаг {step} / 6</span>
          <button onClick={next} disabled={!canNext || submitting} className="btn-primary" data-testid="nav-next">
            {step === 5 ? (submitting ? 'Отправка…' : 'Отправить') : 'Далее'} <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, testId }: any) {
  return (
    <div>
      <label className="text-2xs uppercase tracking-widest font-bold block mb-2" style={{ color: '#8A8A8A' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="input-dark" data-testid={testId} />
    </div>
  );
}
function FieldSelect({ label, value, onChange, options, testId }: any) {
  return (
    <div>
      <label className="text-2xs uppercase tracking-widest font-bold block mb-2" style={{ color: '#8A8A8A' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="select-dark" data-testid={testId}>
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
