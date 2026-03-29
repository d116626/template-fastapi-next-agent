'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, MessageSquare } from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';

export default function HomePage() {
  return (
    <>
      <AppHeader
        title="Vortex Chat"
        subtitle="Sistema de conversação com agente inteligente"
      />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/chat" className="group">
            <Card className="h-full transition-all duration-200 ease-in-out hover:border-primary hover:shadow-lg">
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <CardTitle>Chat</CardTitle>
                <CardDescription>
                  Converse com o agente inteligente
                </CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="flex items-center text-sm font-medium text-primary">
                      Ir para o Chat
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </>
  );
}
