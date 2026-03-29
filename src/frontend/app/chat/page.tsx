'use client';

import React from 'react';
import ChatClient from './components/ChatClient';

export default function ChatPage() {
  return (
    <div className="h-full w-full p-6 overflow-hidden">
      <ChatClient />
    </div>
  );
}