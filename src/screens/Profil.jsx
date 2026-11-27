import { Link } from 'react-router-dom';
import { useData } from '../data.jsx';
import { MonthCalendar } from '../day.jsx';
import { buildPlan } from '../lib/running.js';
import { nextSession } from '../lib/routines.js';
import { Icon, GlassHeader, Group, SettingRow } from '../components.jsx';
import { fmtDay } from '../lib/stats.js';

// The athlete's own space: who, this month's activity, the calendar, shortcuts.
// Every setting lives in Réglages (the gear, top right).
export default function Profil({ user }) {
  const data = useData();
  const { summary: s } = data;
  const name = user?.user_metadata?.name || 'Kilian';
  const planned = data.runProfile ? buildPlan(data.runProfile, data.runLogs, data.workouts).weeks.flat() : [];
  const { program } = nextSession(data);
  const plannedGym = program ? program.days.filter((x) => x && !x.done).map((x) => x.date) : [];
  const weight = user?.user_metadata?.weight_kg;

  return (
    <main className="screen">
      <GlassHeader eyebrow={s.since ? `Membre depuis le ${fmtDay(s.since)} ${s.since.getFullYear()}` : user?.email} title={name}
        lead={<div className="glass-avatar display" aria-hidden="true">{name[0]}</div>}
        right={<Link to="/reglages" className="icon-btn" aria-label="Réglages"><Icon name="gear" size={21} /></Link>} />

      <div className="section" style={{ paddingTop: 10 }}>
        <MonthCalendar planned={planned} plannedGym={plannedGym} withSummary />
      </div>

      <div className="section" style={{ paddingTop: 28 }}>
        <Group title="Mon activité" id="g-activite">
          <SettingRow icon="clock" to="/historique">Historique des entraînements</SettingRow>
          <SettingRow icon="trophy" to="/progres" right={s.sessions ? <span className="val">{s.sessions} séance{s.sessions > 1 ? 's' : ''}</span> : null}>Records et progrès</SettingRow>
          <SettingRow icon="run" to="/course">{data.runProfile ? 'Mon plan de course' : 'Créer un plan de course'}</SettingRow>
          <SettingRow icon="list" to="/programmes" right={program ? <span className="val">{program.program.title}</span> : null}>Programme de muscu</SettingRow>
        </Group>
      </div>

      <div className="section" style={{ paddingTop: 24 }}>
        <Group title="Moi" id="g-moi">
          <SettingRow icon="user" to="/reglages/compte" right={weight ? <span className="val">{String(weight).replace('.', ',')} kg</span> : null}>Informations personnelles</SettingRow>
          <SettingRow icon="gear" to="/reglages">Réglages</SettingRow>
        </Group>
      </div>
    </main>
  );
}
