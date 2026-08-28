import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AdminLayout } from './components/AdminLayout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import General from './pages/General';
import Comercios from './pages/Comercios';
import Veterinarios from './pages/Veterinarios';
import Especialidades from './pages/Especialidades';
import Emergencias from './pages/Emergencias';
import Usuarios from './pages/Usuarios';
import Finanzas from './pages/Finanzas';
import MigoAI from './pages/MigoAI';
import Marketing from './pages/Marketing';
import Planes from './pages/Planes';
import Configuracion from './pages/Configuracion';

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

  // Consola exclusiva de Super Admin
  if (user.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-heading text-2xl font-extrabold text-migo-heading">Acceso restringido</h1>
        <p className="max-w-sm text-slate-500">Esta consola es solo para el personal Super Admin de Migo.</p>
        <button onClick={logout} className="rounded-xl bg-brand-500 px-5 py-2.5 font-semibold text-white hover:bg-brand-600">
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<General />} />
        <Route path="/comercios" element={<Comercios />} />
        <Route path="/veterinarios" element={<Veterinarios />} />
        <Route path="/especialidades" element={<Especialidades />} />
        <Route path="/emergencias" element={<Emergencias />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/finanzas" element={<Finanzas />} />
        <Route path="/migo-ai" element={<MigoAI />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/planes" element={<Planes />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminLayout>
  );
}
