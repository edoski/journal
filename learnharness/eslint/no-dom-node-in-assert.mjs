import ts from "typescript";

/**
 * A failing node:assert comparison renders both arguments into its message.
 * Rendering a linkedom node walks the whole fake document outside the V8
 * heap: one failing test reached 35 GB and took macOS down with it.
 * `assert.ok(a === b)` prints the source expression instead, never the node.
 */

const MODULES = new Map([
	["node:assert", false],
	["assert", false],
	["node:assert/strict", true],
	["assert/strict", true],
]);

const DEEP = new Set(["deepEqual", "deepStrictEqual", "notDeepEqual", "notDeepStrictEqual", "partialDeepStrictEqual"]);

const identityOperator = (method, strict) =>
	({
		equal: strict ? "===" : "==",
		notEqual: strict ? "!==" : "!=",
		strictEqual: "===",
		notStrictEqual: "!==",
	})[method];

const LOOSER_THAN_EQUALITY = new Set(["==", "!=", "===", "!==", "&", "^", "|", "&&", "||", "??"]);

const needsParens = (node) =>
	["ConditionalExpression", "AssignmentExpression", "SequenceExpression", "ArrowFunctionExpression", "YieldExpression"].includes(node.type) ||
	((node.type === "BinaryExpression" || node.type === "LogicalExpression") && LOOSER_THAN_EQUALITY.has(node.operator));

/** @type {import("eslint").Rule.RuleModule} */
export default {
	meta: {
		type: "problem",
		fixable: "code",
		schema: [],
		messages: {
			identity:
				"Write `assert.ok(a {{operator}} b, msg)`: a failing `{{method}}` renders the DOM node into its message, which walks the whole document and can eat tens of GB.",
			deep: "Compare plain values (textContent, getAttribute, counts) inside `{{method}}`, or use `assert.ok(...)`: a failing `{{method}}` renders the DOM node into its message, which walks the whole document and can eat tens of GB.",
		},
	},
	create(context) {
		const services = context.sourceCode.parserServices;
		if (!services?.program) throw new Error("no-dom-node-in-assert needs type information (parserOptions.projectService).");
		const checker = services.program.getTypeChecker();
		const domNode = checker.resolveName("Node", undefined, ts.SymbolFlags.Type, false);
		if (!domNode) throw new Error("no-dom-node-in-assert needs lib.dom in the TypeScript program.");
		const domNodeType = checker.getDeclaredTypeOfSymbol(domNode);

		const holdsDomNode = (type, seen) => {
			if (seen.has(type)) return false;
			seen.add(type);
			if (type.isUnionOrIntersection()) return type.types.some((member) => holdsDomNode(member, seen));
			if (type.isTypeParameter()) {
				const constraint = checker.getBaseConstraintOfType(type);
				return constraint !== undefined && holdsDomNode(constraint, seen);
			}
			if (!(type.flags & ts.TypeFlags.Object)) return false;
			if (checker.isArrayType(type) || checker.isTupleType(type)) return checker.getTypeArguments(type).some((member) => holdsDomNode(member, seen));
			return checker.isTypeAssignableTo(type, domNodeType);
		};
		const isDomNode = (node) => holdsDomNode(checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node)), new Set());

		const namespaces = new Map();
		const named = new Map();

		return {
			ImportDeclaration(node) {
				const strict = MODULES.get(node.source.value);
				if (strict === undefined) return;
				for (const spec of node.specifiers) {
					if (spec.type === "ImportSpecifier") named.set(spec.local.name, { method: spec.imported.name, strict });
					else namespaces.set(spec.local.name, strict);
				}
			},
			CallExpression(node) {
				const { callee } = node;
				let target;
				if (callee.type === "MemberExpression" && !callee.computed && callee.object.type === "Identifier" && namespaces.has(callee.object.name))
					target = { method: callee.property.name, strict: namespaces.get(callee.object.name), member: callee };
				else if (callee.type === "Identifier" && named.has(callee.name)) target = named.get(callee.name);
				if (!target) return;
				const operator = identityOperator(target.method, target.strict);
				if (!operator && !DEEP.has(target.method)) return;

				const [left, right, message, ...rest] = node.arguments;
				if (!left || !right || [left, right, message].some((arg) => arg?.type === "SpreadElement")) return;
				if (!isDomNode(left) && !isDomNode(right)) return;

				if (!operator) {
					context.report({ node, messageId: "deep", data: { method: target.method } });
					return;
				}
				const text = (arg) => (needsParens(arg) ? `(${context.sourceCode.getText(arg)})` : context.sourceCode.getText(arg));
				context.report({
					node,
					messageId: "identity",
					data: { method: target.method, operator },
					fix:
						target.member && rest.length === 0
							? (fixer) => [
									fixer.replaceText(target.member.property, "ok"),
									fixer.replaceTextRange(
										[left.range[0], (message ?? right).range[1]],
										`${text(left)} ${operator} ${text(right)}${message ? `, ${context.sourceCode.getText(message)}` : ""}`,
									),
								]
							: null,
				});
			},
		};
	},
};
