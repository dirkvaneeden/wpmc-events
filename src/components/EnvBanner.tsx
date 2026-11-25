// Shows a bright bar on the test system only, so nobody mistakes it for the real site.
// Turn it on by setting NEXT_PUBLIC_APP_ENV=staging on the staging environment.
export default function EnvBanner() {
  if (process.env.NEXT_PUBLIC_APP_ENV !== 'staging') return null;
  return (
    <div
      role="status"
      style={{
        background: '#e9730c',
        color: '#ffffff',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        padding: '6px 12px',
        letterSpacing: '0.02em',
      }}
    >
      TEST SYSTEM: nothing here is real. Do not enter real payments or personal details.
    </div>
  );
}
