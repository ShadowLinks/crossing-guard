import { useEffect, useMemo, useState } from "react";
import { api, OrgUnitNode } from "../api";

/**
 * Returns a pruned copy of the tree containing only nodes that match the
 * query (by name or OU path) plus the ancestors needed to reach them, so
 * the picker still reads as a tree instead of a flat list of hits. If an
 * ancestor itself matches, its full original subtree is kept (that's
 * almost always what someone searching for e.g. "Elementary" wants - every
 * school under it, not just the ones whose own name repeats the word).
 * An empty query is a no-op and returns the tree unchanged.
 */
function filterTree(node: OrgUnitNode, query: string): OrgUnitNode | null {
  const q = query.trim().toLowerCase();
  if (!q) return node;

  const selfMatches = node.name.toLowerCase().includes(q) || node.orgUnitPath.toLowerCase().includes(q);
  if (selfMatches) return node;

  const matchingChildren = node.children.map((child) => filterTree(child, query)).filter((c): c is OrgUnitNode => c !== null);

  if (matchingChildren.length === 0) return null;
  return { ...node, children: matchingChildren };
}

function Node({
  node,
  depth,
  selected,
  onSelect
}: {
  node: OrgUnitNode;
  depth: number;
  selected: string;
  onSelect: (path: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        className={`ou-row ${selected === node.orgUnitPath ? "ou-row-selected" : ""}`}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
        onClick={() => onSelect(node.orgUnitPath)}
      >
        {node.name}
        <span className="ou-path">{node.orgUnitPath}</span>
      </button>
      {node.children.map((child) => (
        <Node key={child.orgUnitId} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default function OrgUnitPicker({
  value,
  onChange
}: {
  value: string;
  onChange: (orgUnitPath: string) => void;
}) {
  const [tree, setTree] = useState<OrgUnitNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .orgUnits()
      .then(setTree)
      .catch((err) => setError(err.message));
  }, []);

  const filteredTree = useMemo(() => (tree ? filterTree(tree, query) : null), [tree, query]);

  if (error) {
    return <div className="banner banner-error">Could not load org units: {error}</div>;
  }
  if (!tree) {
    return <div className="muted">Loading org units...</div>;
  }

  return (
    <div>
      <div className="ou-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search org units by name or path..."
          aria-label="Search org units"
        />
        {query && (
          <button type="button" className="ou-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
            &times;
          </button>
        )}
      </div>
      <div className="ou-tree">
        {filteredTree ? (
          <Node node={filteredTree} depth={0} selected={value} onSelect={onChange} />
        ) : (
          <div className="muted ou-no-results">No org units match "{query}".</div>
        )}
      </div>
    </div>
  );
}
