import { BookOpen, Brain, Mic, PenLine, Sparkles, Target, Trophy, Headphones } from 'lucide-react';
import { Button } from '@linguaai/ui';
import { AgentPersonaHeader, InlineCorrection, MessageBubble } from '@linguaai/ui/ai-chat';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@linguaai/ui/cards';
import { CefrBadge } from '@linguaai/ui/progress';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

const JOURNEYS = [
  {
    title: 'AI assessment',
    description:
      'A short, adaptive placement — 15 minutes or less — resolves your real CEFR level per skill and builds your first learning roadmap.',
    icon: Brain,
  },
  {
    title: 'Daily learning loop',
    description:
      'A dashboard built around one clear daily goal — streaks, targeted lessons, and weakness detection that adapts as you improve.',
    icon: Target,
  },
  {
    title: 'Speaking practice',
    description:
      'Real-time voice conversation with fluency and pronunciation scoring — practice speaking out loud, not just multiple choice.',
    icon: Mic,
  },
  {
    title: 'Exam preparation',
    description:
      'Mock tests and band scoring for IELTS, TOEFL, JLPT, TOPIK, HSK, and DELE, built on the same adaptive engine as everyday practice.',
    icon: Trophy,
  },
];

const FEATURES = [
  {
    title: 'AI Teacher',
    description:
      'A persistent AI tutor with memory of your progress, grounded in real course content.',
    icon: Sparkles,
  },
  {
    title: 'Structured courses',
    description: 'CEFR-aligned levels, units, and lessons — a real curriculum, not just drills.',
    icon: BookOpen,
  },
  {
    title: 'Vocabulary & SRS',
    description:
      'Spaced repetition keeps what you learn from fading — reviews scheduled exactly when you need them.',
    icon: Brain,
  },
  {
    title: 'Pronunciation lab',
    description:
      'Sound-by-sound feedback against native pronunciation, not just a pass/fail score.',
    icon: Headphones,
  },
  {
    title: 'Writing assistant',
    description: 'AI-guided writing practice and story generation tailored to your current level.',
    icon: PenLine,
  },
  {
    title: 'Gamification',
    description: 'XP, streaks, levels, and badges that reward consistency, not just correctness.',
    icon: Trophy,
  },
];

const PERSONAS = [
  {
    name: 'Maria',
    role: 'Relocating professional',
    summary:
      'Time-constrained and outcome-driven — needs real speaking practice she can fit into a commute, not another app she abandons in a week.',
  },
  {
    name: 'Kenji',
    role: 'Self-directed hobbyist',
    summary:
      'Motivated by streaks, levels, and badges — gamification keeps him coming back, and price matters as much as content.',
  },
  {
    name: 'Aisha',
    role: 'Exam candidate',
    summary:
      'Preparing for IELTS on a deadline — needs realistic mock tests and band-aligned scoring, not generic practice.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-16 tablet:py-24">
          <div className="grid grid-cols-1 items-center gap-12 desktop:grid-cols-2 desktop:gap-16">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-ai px-3 py-1 type-caption font-semibold text-ai-text">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                AI-powered language coaching
              </span>
              <h1 className="mt-6 type-display-xl text-text">
                Your personal AI teacher for every language.
              </h1>
              <p className="mt-4 type-body-lg text-neutral-text">
                LinguaAI combines an adaptive AI tutor, structured CEFR courses, real-time speaking
                practice, and Duolingo-style motivation into one place to actually learn a language
                — not just collect streak badges.
              </p>
              <div className="mt-8 flex flex-col gap-3 tablet:flex-row">
                <Button variant="primary" size="default" asChild className="w-full tablet:w-auto">
                  <a href="/register">Start learning free</a>
                </Button>
                <Button variant="secondary" size="default" asChild className="w-full tablet:w-auto">
                  <a href="/login">Log in</a>
                </Button>
              </div>
              <div className="mt-6 flex items-center gap-2">
                {(['A1', 'B1', 'C1'] as const).map((level) => (
                  <CefrBadge key={level} level={level} />
                ))}
                <span className="type-caption text-neutral-text">
                  Every level, from first words to fluency
                </span>
              </div>
            </div>

            <Card aria-hidden="true" className="shadow-medium">
              <CardContent className="flex flex-col gap-4 pt-6">
                <AgentPersonaHeader name="Aria" title="AI Language Tutor" />
                <div className="flex flex-col gap-3">
                  <MessageBubble role="user">
                    How do I say &ldquo;I would like a coffee&rdquo; in Spanish?
                  </MessageBubble>
                  <MessageBubble role="ai">Quisiera un café, por favor.</MessageBubble>
                  <MessageBubble role="user">I go to the store yesterday.</MessageBubble>
                  <MessageBubble role="ai">
                    <InlineCorrection
                      parts={[
                        { text: 'I go', type: 'original' },
                        { text: 'I went', type: 'correction' },
                        { text: ' to the store yesterday.', type: 'original' },
                      ]}
                    />
                  </MessageBubble>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Core journeys — a numbered sequence, not an unordered grid */}
        <section id="how-it-works" className="border-t border-border bg-surface-muted">
          <div className="mx-auto max-w-6xl px-4 py-16 tablet:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="type-heading-xl text-text">How LinguaAI teaches you</h2>
              <p className="mt-3 type-body-md text-neutral-text">
                One connected loop, not four separate apps bolted together.
              </p>
            </div>
            <ol className="mt-12 grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-4">
              {JOURNEYS.map((journey, index) => (
                <li key={journey.title}>
                  <Card className="h-full">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-solid type-body-sm font-semibold text-white">
                          {index + 1}
                        </span>
                        <journey.icon className="h-5 w-5 text-primary-text" aria-hidden="true" />
                      </div>
                      <CardTitle className="mt-3">{journey.title}</CardTitle>
                      <CardDescription>{journey.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Feature grid */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-16 tablet:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="type-heading-xl text-text">Everything a real curriculum needs</h2>
            <p className="mt-3 type-body-md text-neutral-text">
              Built on the same AI engine end to end — assessment, lessons, and practice all
              understand your real level.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="pt-6">
                  <feature.icon className="h-6 w-6 text-primary-text" aria-hidden="true" />
                  <h3 className="mt-3 type-heading-md text-text">{feature.title}</h3>
                  <p className="mt-1 type-body-sm text-neutral-text">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Personas */}
        <section className="border-t border-border bg-surface-muted">
          <div className="mx-auto max-w-6xl px-4 py-16 tablet:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="type-heading-xl text-text">Built for how you actually learn</h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 tablet:grid-cols-3">
              {PERSONAS.map((persona) => (
                <Card key={persona.name}>
                  <CardHeader>
                    <CardTitle>{persona.name}</CardTitle>
                    <CardDescription>{persona.role}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="type-body-sm text-neutral-text">{persona.summary}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 tablet:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="type-heading-xl text-text">Start free. Upgrade when you're ready.</h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 tablet:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <CardDescription>Everything you need to start learning today.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="space-y-2 type-body-sm text-neutral-text">
                  <li>AI placement assessment</li>
                  <li>Structured course access</li>
                  <li>Vocabulary review (SRS)</li>
                  <li>Daily goals & streaks</li>
                </ul>
                <Button variant="secondary" asChild className="w-full">
                  <a href="/register">Create a free account</a>
                </Button>
              </CardContent>
            </Card>
            <Card className="border-primary-text">
              <CardHeader>
                <CardTitle>Premium</CardTitle>
                <CardDescription>Full access to real-time speaking and exam prep.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="space-y-2 type-body-sm text-neutral-text">
                  <li>Everything in Free</li>
                  <li>Unlimited speaking practice</li>
                  <li>Pronunciation lab</li>
                  <li>Exam preparation & mock tests</li>
                  <li>Writing assistant & AI stories</li>
                </ul>
                <Button variant="primary" asChild className="w-full">
                  <a href="/register">Upgrade to Premium</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA banner */}
        <section className="border-t border-border bg-primary-solid">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center">
            <h2 className="type-heading-xl text-white">Ready to actually learn a language?</h2>
            <p className="mt-3 type-body-md text-white/90">
              Take your free AI assessment and get a roadmap built around your real level.
            </p>
            <Button variant="secondary" size="default" asChild className="mt-8">
              <a href="/register">Take the free assessment</a>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
