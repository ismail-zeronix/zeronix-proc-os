"use client";

import { MotionConfig, motion } from "motion/react";

/**
 * The site's few motion pieces (Motion, formerly Framer Motion). Rules, from BRAND.md "Motion" and the scroll-reveal
 * gotcha: they only ever move things by a few pixels and never start at opacity 0, so the server HTML is always fully
 * visible to visitors and search engines; and they switch off for visitors who ask for reduced motion.
 */

const ease = [0.22, 1, 0.36, 1] as const;

/** A list item that rises 14px into place the first time it scrolls into view; `index` staggers a row. */
export function RiseItem({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.li
        className={className}
        initial={{ y: 14 }}
        whileInView={{ y: 0 }}
        viewport={{ once: true, margin: "0px 0px -40px 0px" }}
        transition={{ duration: 0.6, ease, delay: Math.min(index, 8) * 0.045 }}
      >
        {children}
      </motion.li>
    </MotionConfig>
  );
}

/** A card that lifts slightly under the pointer and dips when pressed. */
export function Lift({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div className={className} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}

/** A slow, small float (hero product cards): `delay` keeps several cards out of step. */
export function Float({ delay = 0, distance = 6, className, children }: { delay?: number; distance?: number; className?: string; children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div className={className} animate={{ y: [0, -distance, 0] }} transition={{ duration: 6, ease: "easeInOut", repeat: Infinity, delay }}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
