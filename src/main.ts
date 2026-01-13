import {EditorState, Plugin, PluginKey} from "prosemirror-state";
import {EditorView, Decoration, DecorationSet} from "prosemirror-view";
import {DOMSerializer, Schema} from "prosemirror-model";
import './style.css';

// --- 1. Setup Schema ---
const schema = new Schema({
  nodes: {
    doc: {content: "inline*"},
    text: {group: "inline"},
    // The target node we hope to save from destruction
    test_node: {
      group: "inline",
      content: "text*",
      inline: true,
      toDOM: () => ["span", {class: "test-node", style: "border: 1px solid blue"}, 0]
    }
  },
  marks: {
    strong: {toDOM: () => ["strong", 0]}
  }
});

// --- 2. Widget Plugin ---
const widgetKey = new PluginKey("widget-plugin");
const widgetPlugin = new Plugin({
  key: widgetKey,
  state: {
    init() {
      return {showWidgets: true};
    },
    apply(tr, val) {
      const meta = tr.getMeta(widgetKey);
      return meta !== undefined ? {showWidgets: meta} : val;
    }
  },
  props: {
    decorations(state) {
      const {showWidgets} = widgetKey.getState(state);
      if (!showWidgets) return DecorationSet.empty;

      const widgets = [];
      // ADD 3 WIDGETS (The Barrier)
      // They are placed at pos=1 (before the content)
      for (let i = 0; i < 3; i++) {
        widgets.push(Decoration.widget(0, () => {
          const s = document.createElement("span");
          s.classList.add("widget")
          s.textContent = `[W${i+1}]`;
          return s;
        }, {key: `w${i+1}`, side: -1}));
      }
      return DecorationSet.create(state.doc, widgets);
    }
  }
});

// --- 4. Editor Setup ---
const doc = schema.node("doc", null, [
  // The target node is wrapped in STRONG
  // This forces syncToMarks to run and search for the 'strong' mark view
  ...Array(10).fill(null).map((_value, index)=>(
  schema.node("test_node", null, [
    schema.text(`Target Node ${index + 1}`)
  ], [
    schema.marks.strong.create()
  ])))
]);

const triggerButton = document.createElement("button");
document.body.appendChild(triggerButton);

const view = new EditorView(document.querySelector("#app") || document.body, {
  state: EditorState.create({doc, schema, plugins: [widgetPlugin]}),
  nodeViews: {
    test_node: () => {
      const eventText = document.createElement("p");
      eventText.classList.add("event-text");
      eventText.classList.add("info");
      eventText.textContent = 'Event: A target node\'s constructor was called.';
      document.body.appendChild(eventText);
      const {dom, contentDOM} = DOMSerializer.renderSpec(document, ["span", {class: "test-node", style: "border: 1px solid blue"}, 0]);
      return ({
        dom,
        contentDOM,
        update: () => {
          console.log("%c✅ Target Node Updated", "color: green; font-weight: bold");
          const eventText = document.createElement("p");
          eventText.classList.add("event-text");
          eventText.classList.add("info");
          eventText.textContent = 'Event: update() was called on a Target Node.';
          document.body.appendChild(eventText);
          return true;
        },
        destroy: () => {
          console.log("%c❌ Target Node Destroyed", "color: red; font-weight: bold");
          const eventText = document.createElement("p");
          eventText.classList.add("event-text");
          eventText.classList.add("warn");
          eventText.textContent = 'Event: destroy() was called on a Target Node.';
          document.body.appendChild(eventText);
        }
      });
    }
  }
});

// --- 5. Trigger Bug ---
console.log("Initial render complete. Widgets are present.");


triggerButton.textContent = "Trigger Bug";
function triggerBug() {
  console.log("\n--- UPDATING (Removing Widgets) ---");
  const tr = view.state.tr;

  // 1. Remove the widgets
  tr.setMeta(widgetKey, false);

  // Originally - we had
  // 2. Insert new content BEFORE the nodeview
  // We insert a Text Node at pos 0.
  // tr.insert(0, schema.text("NEW CONTENT "));

  view.dispatch(tr);

  triggerButton.disabled = true;
}
triggerButton.addEventListener("click", triggerBug);

const bugOverview = document.createElement("div");
bugOverview.classList.add("bug");
bugOverview.innerHTML = `
<h2>ProseMirror NodeView Destruction Bug Demo</h2>
<p>
This demo showcases a ProseMirror bug where nodes in a page are unnecessarily destroyed when certain conditions are met:
<ol>
<li>There are 3+ widget decorations present in the editor.</li>
<li>A transaction removes these widgets.</li>
<li>The next node(s) in the document have marks applied to them.</li>
</ol>
<p>
When this occurs, <code>updateChildren</code> iterates over the nodes from the new state, and tries to sync the marks on these nodes to their corresponding mark views by calling <code>syncToMarks</code>.
</p>
<p>
This *should* work, however the three widgets that are still in <code>updater.top.children</code> block the 3-item lookahead for mark views, meaning the mark views are not found.
</p>
<p>
As a result, ProseMirror assumes the node views cannot be updated and calls <code>destroy()</code> on all of them.
</p>
<p>
If many nodes are present and are expensive to create/destroy, this can lead to significant performance issues, as all of those nodes are needlessly torn down and rebuilt.
</p>

<p>
To see the bug in action, click the "Trigger Bug" button below. Observe the console logs and the appended event text indicating destruction of target nodes.
</p>
<br/>
<p>
You can also view this in more detail in the browser devtools by placing a breakpoint in <code>syncToMarks</code> after the page loads. Searching for "+ 3" may help you find it.
</p>
`;
document.body.insertBefore(bugOverview, document.body.firstChild);