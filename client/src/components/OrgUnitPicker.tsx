import { useEffect, useState } from "react";
import { api, OrgUnitNode } from "../api";

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

  useEffect(() => {
    api
      .orgUnits()
      .then(setTree)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <div className="banner banner-error">Could not load org units: {error}</div>;
  }
  if (!tree) {
    return <div className="muted">Loading org units...</div>;
  }

  return (
    <div className="ou-tree">
      <Node node={tree} depth={0} selected={value} onSelect={onChange} />
    </div>
  );
}
