import React, { createContext, useContext, useState } from 'react';

interface TunnelModalContextType {
  isCreateModalOpen: boolean;
  openCreateModal: () => void;
  closeCreateModal: () => void;
}

const TunnelModalContext = createContext<TunnelModalContextType | undefined>(undefined);

export const useTunnelModal = () => {
  const context = useContext(TunnelModalContext);
  if (context === undefined) {
    throw new Error('useTunnelModal must be used within a TunnelModalProvider');
  }
  return context;
};

interface TunnelModalProviderProps {
  children: React.ReactNode;
}

export const TunnelModalProvider: React.FC<TunnelModalProviderProps> = ({ children }) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const openCreateModal = () => setIsCreateModalOpen(true);
  const closeCreateModal = () => setIsCreateModalOpen(false);

  return (
    <TunnelModalContext.Provider value={{
      isCreateModalOpen,
      openCreateModal,
      closeCreateModal,
    }}>
      {children}
    </TunnelModalContext.Provider>
  );
}; 