import './globals.css';

export const metadata = {
  title: 'BrandPulse AI',
  description: 'Brand safety, compliance & approvals in one place',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-100">{children}</body>
    </html>
  );
}
