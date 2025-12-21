<script lang="ts">
  import { defineComponent, h, computed } from 'vue'
  import { highlightTree } from '@lezer/highlight'
  import { defaultHighlightStyle } from '@codemirror/language'
  import { parser as cppParser } from '@lezer/cpp'
  import { parser as javascriptParser } from '@lezer/javascript'
  import { parser as rustParser } from '@lezer/rust'
  import { parser as goParser } from '@lezer/go'

  export default defineComponent({
    name: 'CodeHighlighter',
    props: {
      code: {
        type: String,
        required: true
      },
      language: {
        type: String as () => 'cpp' | 'javascript' | 'typescript' | 'rust' | 'go',
        required: true
      }
    },
    setup(props) {
      const parser = computed(() => {
        switch (props.language) {
          case 'cpp':
            return cppParser
          case 'javascript':
          case 'typescript':
            return javascriptParser
          case 'rust':
            return rustParser
          case 'go':
            return goParser
          default:
            return javascriptParser
        }
      })

      return () => {
        const code = props.code || ''
        
        if (!code) {
          return h('pre', { class: 'code-highlight' }, h('code', {}))
        }

        try {
          const tree = parser.value.parse(code)
          let pos = 0
          let output: any[] = []

          highlightTree(tree, defaultHighlightStyle, (from, to, classes: any) => {
            if (from > pos) {
              output.push(h('span', {}, code.slice(pos, from)))
            }
            let classString = ''
            if (Array.isArray(classes)) {
              classString = classes.join(' ')
            } else if (classes && typeof classes === 'object' && classes.constructor === Set) {
              classString = Array.from(classes as Set<string>).join(' ')
            } else {
              classString = String(classes || '')
            }
            output.push(h('span', { class: classString }, code.slice(from, to)))
            pos = to
          })

          if (code.length > pos) {
            output.push(h('span', {}, code.slice(pos)))
          }

          return h('pre', { class: 'code-highlight' }, h('code', { class: `language-${props.language}` }, output))
        } catch (error) {
          // Fallback to plain code if parsing fails
          return h('pre', { class: 'code-highlight' }, h('code', { class: `language-${props.language}` }, code))
        }
      }
    }
  })
</script>

<style scoped>
  .code-highlight {
    background-color: rgb(249 250 251);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  .app-dark-mode .code-highlight {
    background-color: rgb(17 24 39);
  }

  .code-highlight :deep(code) {
    display: block;
  }
</style>
