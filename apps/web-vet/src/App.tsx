import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, isStaff, isClinicAdmin } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import Urgencias from './pages/Urgencias';
import Pacientes from './pages/Pacientes';
import Equipo from './pages/Equipo';
import Servicios from './pages/Servicios';
import Finanzas from './pages/Finanzas';
import Configuracion from './pages/Configuracion';
import Chats from './pages/Chats';

function AccessDenied({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
      <div className="text-4xl">🩺</div>
      <h1 className="font-heading text-2xl font-extrabold text-migo-heading">Acceso restringido</h1>
      <p className="max-w-sm text-slate-500">Este panel es para el personal de clínica. Ingresa con tu usuario de veterinario o gestor de una sucursal.</p>
      <button onClick={onLogout} className="rounded-xl bg-brand-500 px-5 py-2.5 font-semibold text-white hover:bg-brand-600">
        Cerrar sesión
      </button>
    </div>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Candado nivel 1: solo personal de clínica (con perfil de staff)
  if (!isStaff(user)) return <AccessDenied onLogout={logout} />;

  // Candado nivel 2: secciones de administración solo para admins de sucursal
  const admin = isClinicAdmin(user);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/urgencias" element={<Urgencias />} />
        <Route path="/pacientes" element={<Pacientes />} />
        <Route path="/chats" element={<Chats />} />
        {admin && <Route path="/equipo" element={<Equipo />} />}
        {admin && <Route path="/servicios" element={<Servicios />} />}
        {admin && <Route path="/finanzas" element={<Finanzas />} />}
        {admin && <Route path="/configuracion" element={<Configuracion />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
