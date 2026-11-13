import { Github, Mail, ShieldAlert, Sparkles } from "lucide-react";
import { PageTitle, Panel } from "@/components/ui";

const principles = [
  ["Clarity over certainty", "Show the probabilities, assumptions and uncertainty behind each model output."],
  ["Risk before return", "Every directional idea is paired with an illustrative stop, target and intraday horizon."],
  ["Reproducible research", "Use deterministic offline data, explicit transaction costs and chronological evaluation."],
];

export default function AboutPage() {
  return <div className="page-stack">
    <PageTitle eyebrow="ABOUT THE PROJECT" title="Built for better questions." description="SignalForge is a hackathon research prototype for the Astraquant X-2026 challenge at KLH Aziz Nagar." />
    <Panel className="about-hero"><div className="about-brand-icon"><Sparkles size={25} /></div><div><div className="eyebrow">AI INTRADAY BUY / SELL SIGNAL GENERATOR</div><h2>Make intraday research transparent, testable and risk-aware.</h2><p>We bring market data, technical features, model evaluation and strategy simulation into one compact workbench — designed for learning and experimentation.</p></div></Panel>
    <div className="about-principles">{principles.map(([title, copy], index) => <Panel key={title}><span className="principle-number">0{index + 1}</span><h2>{title}</h2><p>{copy}</p></Panel>)}</div>
    <Panel className="about-team"><div className="team-copy"><div className="eyebrow">THE TEAM</div><h2>SignalForge · Astraquant X-2026</h2><p>Created as an educational prototype. Add team member names, institute details and project links before presenting externally.</p></div><div className="team-badge">KLH<br /><small>AZIZ NAGAR</small></div></Panel>
    <div className="risk-disclaimer"><div className="risk-disclaimer-icon"><ShieldAlert size={19} /></div><div><strong>Important risk disclaimer</strong><p>SignalForge is for educational and research purposes only and is not financial, investment, tax or legal advice. It does not execute trades or connect to a broker. Demo data and simulated results are not representative of actual market conditions or future performance. Trading equities and derivatives involves substantial risk, including loss of capital. Make independent decisions and consult a qualified professional where appropriate.</p></div></div>
    <div className="about-links"><span><Github size={15} /> Self-hosted research project</span><span><Mail size={15} /> Team details not configured</span></div>
  </div>;
}
