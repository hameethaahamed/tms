import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  const DEMO = [
    { email: 'admin@test.com', password: 'admin123', role: 'Admin' },
    { email: 'qa@test.com',    password: 'qa123',    role: 'QA'    },
    { email: 'po@test.com',    password: 'po123',    role: 'PO'    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">Testly</h1>
          <p className="text-gray-500 mt-1">Test Management Tool</p>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign in</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <div className="card p-4 mt-4">
          <p className="text-xs text-gray-500 mb-3 font-medium">Demo accounts</p>
          <div className="space-y-2">
            {DEMO.map((d) => (
              <button key={d.role} onClick={() => { setEmail(d.email); setPassword(d.password); }}
                className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors text-xs">
                <span className="font-medium text-blue-700">{d.role}</span>
                <span className="text-gray-400 ml-2">{d.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
