import type { ReactNode } from "react";
import styles from "./information-page.module.css";

type InformationSection = { title: string; paragraphs: string[] };

export function InformationPage({
  eyebrow,
  title,
  description,
  sections,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: InformationSection[];
  children?: ReactNode;
}) {
  return <div className="page-wrap">
    <header className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
    <article className={styles.content}>
      {sections.map(section => <section key={section.title}>
        <h2>{section.title}</h2>
        {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </section>)}
      {children}
    </article>
  </div>;
}
