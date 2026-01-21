/**
 * A group for organizing funds
 */
export interface Group {
  id: number;
  name: string;
  parentGroupId: number | null;
  type?: string;
  description?: string;
}

/**
 * A group with its children for tree display
 */
export interface GroupTreeNode extends Group {
  children: GroupTreeNode[];
}
