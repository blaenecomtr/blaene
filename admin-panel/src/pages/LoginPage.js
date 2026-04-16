import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuthStore } from '../store/auth';
export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { setToken } = useAuthStore();
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok || !data.data?.token) {
                throw new Error(data.error || 'Giriş başarısız');
            }
            setToken(data.data.token);
        }
        catch (err) {
            setError(err.message || 'E-posta veya şifre yanlış.');
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            padding: '20px'
        }, children: _jsxs("div", { style: {
                width: '100%',
                maxWidth: '400px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '40px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
            }, children: [_jsx("h1", { style: {
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: '#fff',
                        textAlign: 'center',
                        marginBottom: '8px'
                    }, children: "Blaene Admin" }), _jsx("p", { style: {
                        textAlign: 'center',
                        color: '#94a3b8',
                        fontSize: '14px',
                        marginBottom: '30px'
                    }, children: "Y\u00F6netim Paneline Ho\u015Fgeldiniz" }), error && _jsx("div", { style: {
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid #ef4444',
                        color: '#fca5a5',
                        padding: '12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        marginBottom: '20px'
                    }, children: error }), _jsxs("form", { onSubmit: handleSubmit, style: { marginBottom: '20px' }, children: [_jsxs("div", { style: { marginBottom: '20px' }, children: [_jsx("label", { style: {
                                        display: 'block',
                                        marginBottom: '8px',
                                        color: '#cbd5e1',
                                        fontSize: '14px',
                                        fontWeight: '500'
                                    }, children: "E-posta" }), _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "admin@blaene.com", required: true, style: {
                                        width: '100%',
                                        padding: '12px 14px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                        color: '#e2e8f0',
                                        fontSize: '14px'
                                    } })] }), _jsxs("div", { style: { marginBottom: '20px' }, children: [_jsx("label", { style: {
                                        display: 'block',
                                        marginBottom: '8px',
                                        color: '#cbd5e1',
                                        fontSize: '14px',
                                        fontWeight: '500'
                                    }, children: "\u015Eifre" }), _jsxs("div", { style: { position: 'relative' }, children: [_jsx("input", { type: showPassword ? 'text' : 'password', value: password, onChange: (e) => setPassword(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", required: true, style: {
                                                width: '100%',
                                                padding: '12px 14px',
                                                paddingRight: '40px',
                                                background: '#0f172a',
                                                border: '1px solid #334155',
                                                borderRadius: '8px',
                                                color: '#e2e8f0',
                                                fontSize: '14px'
                                            } }), _jsx("button", { type: "button", onClick: () => setShowPassword(!showPassword), style: {
                                                position: 'absolute',
                                                right: '12px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'none',
                                                border: 'none',
                                                color: '#64748b',
                                                cursor: 'pointer',
                                                fontSize: '18px',
                                                padding: '0'
                                            }, children: showPassword ? '🙈' : '👁️' })] })] }), _jsx("button", { type: "submit", disabled: loading, style: {
                                width: '100%',
                                padding: '12px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }, children: loading ? 'Giriş yapılıyor...' : 'Giriş Yap' })] }), _jsx("div", { style: {
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid #3b82f6',
                        color: '#93c5fd',
                        padding: '12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        textAlign: 'center'
                    }, children: "Test Supabase hesab\u0131n\u0131z\u0131 kullanarak giri\u015F yapabilirsiniz." })] }) }));
}
