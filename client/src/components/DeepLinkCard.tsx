import type { ManualSteps } from "../api";

export default function DeepLinkCard({ manual }: { manual: ManualSteps }) {
  return (
    <div className="card">
      <h3>Finish this in the Admin console</h3>
      <p className="muted">{manual.summary}</p>
      <ol className="steps">
        {manual.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <a className="primary-button" href={manual.consoleDeepLink} target="_blank" rel="noreferrer">
        Open Admin console &rarr;
      </a>
    </div>
  );
}
