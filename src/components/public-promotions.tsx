import Link from "next/link";
import Image from "next/image";
import styles from "./public-promotions.module.css";

type Banner = { id: string; title: string; description: string | null; image_url: string | null; destination_url: string | null };
type Announcement = { id: string; title: string; body: string; destination_url: string | null };

export function PublicPromotions({ banners, announcements }: { banners: Banner[]; announcements: Announcement[] }) {
  if (!banners.length && !announcements.length) return null;
  return <section className={styles.promotions} aria-label="Club announcements">
    {banners.map(banner => {
      const content = <><div className={styles.copy}><span className={styles.eyebrow}>PCC ANNOUNCEMENT</span><h2>{banner.title}</h2>{banner.description && <p>{banner.description}</p>}</div>{banner.image_url && <div className={styles.image}><Image src={banner.image_url} alt="" fill sizes="(max-width: 760px) 100vw, 48vw"/></div>}</>;
      return banner.destination_url ? <Link className={styles.banner} href={banner.destination_url} key={banner.id}>{content}</Link> : <article className={styles.banner} key={banner.id}>{content}</article>;
    })}
    {announcements.length > 0 && <div className={styles.announcementList}>{announcements.slice(0, 3).map(item => item.destination_url
      ? <Link className={styles.announcement} href={item.destination_url} key={item.id}><strong>{item.title}</strong><span>{item.body}</span></Link>
      : <article className={styles.announcement} key={item.id}><strong>{item.title}</strong><span>{item.body}</span></article>)}</div>}
  </section>;
}
