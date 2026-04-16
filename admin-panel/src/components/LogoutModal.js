import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuthStore } from '../store/auth';
export default function LogoutModal({ isOpen, onClose }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { logout } = useAuthStore();
    const handleConfirm = async () => {
        if (!password) {
            setError('Lütfen şifrenizi girin.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/verify-logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
                },
                body: JSON.stringify({ password })
            });
            if (!res.ok) {
                throw new Error('Şifre yanlış.');
            }
            logout();
            onClose();
            window.location.href = '/admin/';
        }
        catch (err) {
            setError(err.message || 'Bir hata oluştu.');
        }
        finally {
            setLoading(false);
        }
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { onClick: onClose, style: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }, children: _jsxs("div", { onClick: (e) => e.stopPropagation(), style: {
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '30px',
                maxWidth: '400px',
                width: '90%'
            }, children: [_jsx("h2", { style: {
                        fontSize: '18px',
                        fontWeight: '600',
                        color: '#fff',
                        marginBottom: '10px'
                    }, children: "\u00C7\u0131k\u0131\u015F\u0131 Onayla" }), _jsx("p", { style: {
                        color: '#94a3b8',
                        fontSize: '14px',
                        marginBottom: '20px'
                    }, children: "Devam etmek i\u00E7in y\u00F6netici \u015Fifresini girin." }), _jsxs("div", { style: { marginBottom: '15px' }, children: [_jsx("label", { style: {
                                display: 'block',
                                marginBottom: '5px',
                                fontSize: '13px',
                                fontWeight: '500',
                                color: '#cbd5e1'
                            }, children: "\u015Eifre" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", autoFocus: true, style: {
                                width: '100%',
                                padding: '10px 12px',
                                background: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '6px',
                                color: '#e2e8f0',
                                fontSize: '14px'
                            } })] }), error && _jsx("p", { style: {
                        color: '#ef4444',
                        fontSize: '13px',
                        marginBottom: '10px'
                    }, children: error }), _jsxs("div", { style: { display: 'flex', gap: '10px', marginTop: '20px' }, children: [_jsx("button", { onClick: onClose, style: {
                                flex: 1,
                                padding: '10px',
                                background: '#334155',
                                color: '#cbd5e1',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: 'pointer'
                            }, children: "\u0130ptal" }), _jsx("button", { onClick: handleConfirm, disabled: loading, style: {
                                flex: 1,
                                padding: '10px',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                opacity: loading ? 0.6 : 1
                            }, children: loading ? 'Kontrol ediliyor...' : 'Çıkış Yap' })] })] }) }));
}
