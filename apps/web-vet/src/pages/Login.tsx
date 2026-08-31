import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { MigoLogo } from '../components/MigoLogo';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('maria.perez@migoclinicas.com');
  const [password, setPassword] = useState('Migo1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 flex justify-center"><MigoLogo variant="dark" height={44} /></div>
          <h1 className="text-2xl font-extrabold">Migo Clínicas</h1>
          <p className="text-sm text-sidebar-muted">Panel de gestión veterinaria</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-8">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Correo</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Contraseña</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Entrando…' : 'Iniciar sesión'}
          </button>
          <p className="text-center text-xs text-slate-400">
            Demo: maria.perez@migoclinicas.com / Migo1234
          </p>
        </form>
      </div>
    </div>
  );
}
