import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';

export interface ProjectInfo {
  id: string;
  name: string;
  type: 'SINGLE_REPO' | 'MULTI_SUITE';
  description: string | null;
}

interface ProjectContextValue {
  project: ProjectInfo | null;
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({ project: null, loading: false });

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    client.get(`/projects/${projectId}`)
      .then((r) => setProject(r.data))
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <ProjectContext.Provider value={{ project, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
