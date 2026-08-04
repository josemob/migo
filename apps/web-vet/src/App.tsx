import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
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

export default function App() {
  const { user, loading } = useAuth();

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

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/urgencias" element={<Urgencias />} />
        <Route path="/pacientes" element={<Pacientes />} />
        <Route path="/chats" element={<Chats />} />
        <Route path="/equipo" element={<Equipo />} />
        <Route path="/servicios" element={<Servicios />} />
        <Route path="/finanzas" element={<Finanzas />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
