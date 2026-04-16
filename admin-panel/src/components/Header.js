import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function Header({ onLogoutClick }) {
    return (_jsxs("header", { style: {
            background: '#1e293b',
            borderBottom: '1px solid #334155',
            padding: '20px 30px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginLeft: '260px'
        }, children: [_jsx("h1", { style: {
                    fontSize: '24px',
                    fontWeight: '600',
                    color: '#fff'
                }, children: "Dashboard" }), _jsx("button", { onClick: onLogoutClick, style: {
                    background: '#ef4444',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    border: 'none',
                    cursor: 'pointer'
                }, children: "\u00C7\u0131k\u0131\u015F Yap" })] }));
}
