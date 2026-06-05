type BirthdayAlertProps = {
  note: string;
};

function extractBirthdayName(note: string) {
  const trimmed = note.replace(/\.$/, "").trim();
  const singleMatch = trimmed.match(/^today is (.+?)(?:'s|s') birthday$/i);

  if (singleMatch?.[1]) {
    return singleMatch[1].trim();
  }

  const listMatch = trimmed.match(/^birthdays today:\s*(.+)$/i);
  if (listMatch?.[1]) {
    return listMatch[1].split(",")[0].trim();
  }

  return trimmed.replace(/\bbirthday\b/gi, "").replace(/\s+/g, " ").trim();
}

export default function BirthdayAlert({ note }: BirthdayAlertProps) {
  const birthdayName = extractBirthdayName(note).toUpperCase();

  return (
    <section className="birthday-hud-card" aria-label={`${birthdayName} birthday alert`}>
      <span className="birthday-hud-corner birthday-hud-corner-tl" aria-hidden="true" />
      <span className="birthday-hud-corner birthday-hud-corner-tr" aria-hidden="true" />
      <span className="birthday-hud-corner birthday-hud-corner-bl" aria-hidden="true" />
      <span className="birthday-hud-corner birthday-hud-corner-br" aria-hidden="true" />

      <div className="birthday-hud-icon" aria-hidden="true">
        <span className="birthday-hud-icon-box" />
        <span className="birthday-hud-icon-ribbon" />
        <span className="birthday-hud-spark birthday-hud-spark-a" />
        <span className="birthday-hud-spark birthday-hud-spark-b" />
      </div>

      <div className="birthday-hud-content">
        <p className="birthday-hud-label">Celebration Event</p>
        <h2 className="birthday-hud-name">{birthdayName}</h2>
        <p className="birthday-hud-subtitle">Birthday Detected</p>
        <p className="birthday-hud-footer">
          Jarvis recommends birthday protocol activation.
        </p>
      </div>
    </section>
  );
}
