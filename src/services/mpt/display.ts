/**
 * Patricia Trie Display Capability
 *
 * Simple, compact tree visualization for debugging and inspection.
 * Focuses on readability and compactness without excessive formatting.
 *
 * @module MPTService/Display
 * @since 0.2.0
 */

import { Context, Layer, Match } from "effect";
import * as MPT from "../../entities/mpt";

/**
 * Compact single-line representation of the trie structure.
 * Format: "Branch(child0=..., child1=...) | value=X"
 */
const displayTrie = (trie: MPT.PatriciaTrie): string => {
  const nodeStr = displayNodeCompact(trie.root);
  return `Trie(root=${nodeStr}, size=${trie.size})`;
};

/**
 * Multi-line tree display with indentation.
 */
const displayNode = (node: MPT.PatriciaNode, indent: number = 0): string => {
  const padding = " ".repeat(indent);

  return Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => {
      const value =
        branch.value._tag === "Some"
          ? `, value=${JSON.stringify(branch.value.value)}`
          : "";
      const childLines = Object.entries(branch.children).map(([key, child]) => {
        const childDisplay = displayNode(child, indent + 2);
        return `${" ".repeat(indent + 2)}[${key}] => ${childDisplay.trim()}`;
      });

      const childStr =
        childLines.length > 0 ? `\n${childLines.join("\n")}` : "";

      return `${padding} [B](children=${
        Object.keys(branch.children).length
      }${value})${childStr}`;
    },
    Extension: (ext) => {
      const sharedPrefix = ext.sharedPrefix.map((n) => n.toString(16)).join("");
      const childDisplay = displayNode(ext.nextNode, indent + 2);
      return `${padding}[E](sharedPrefix=[${sharedPrefix}])\n${childDisplay}`;
    },
    Leaf: (leaf) =>
      `${padding}[L](keyEnd=[${leaf.keyEnd.join(",")}], value=${JSON.stringify(
        leaf.value
      )})`,
  })(node);
};

/**
 * Compact inline representation of a node for single-line output.
 */
const displayNodeCompact = (node: MPT.PatriciaNode): string =>
  Match.typeTags<MPT.PatriciaNode>()({
    Branch: (branch) => {
      const childCount = Object.keys(branch.children).length;
      const valueStr =
        branch.value._tag === "Some"
          ? `:${JSON.stringify(branch.value.value)}`
          : "";
      return `B(${childCount}children${valueStr})`;
    },
    Extension: (ext) =>
      `E[${ext.sharedPrefix.join("")}]->${displayNodeCompact(ext.nextNode)}`,
    Leaf: (leaf) => `L[${leaf.keyEnd.join("")}]=${JSON.stringify(leaf.value)}`,
  })(node);

/**
 * PatriciaDisplayService — simple, compact tree visualization
 *
 * Provides minimal display operations for debugging and inspection.
 * Focuses on readability and compactness without excessive formatting.
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class PatriciaDisplayService extends Context.Tag(
  "@services/mpt/MPTDisplayService"
)<
  PatriciaDisplayService,
  {
    readonly displayTrie: (trie: MPT.PatriciaTrie) => string;
    readonly displayNode: (node: MPT.PatriciaNode, indent?: number) => string;
  }
>() {}

/**
 * Live implementation of PatriciaDisplayService
 *
 * @category Services
 * @since 0.2.0
 */
export const PatriciaDisplayServiceLive = Layer.succeed(
  PatriciaDisplayService,
  PatriciaDisplayService.of({
    displayTrie,
    displayNode,
  })
);
