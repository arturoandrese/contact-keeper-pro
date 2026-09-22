# Corregir bases vacías y selección total

1. **Evitar bases con un conteo falso**
   - Guardar los contactos y comprobar cuántos quedaron realmente asociados a la base.
   - Si falla cualquier lote, eliminar la base incompleta y mostrar el error real en vez de dejarla indicando 709 contactos.
   - Actualizar el conteo con la cantidad real guardada antes de mostrar el éxito.

2. **Mostrar siempre la cantidad real**
   - Al cargar la lista de bases, contrastar el número guardado con los contactos existentes.
   - Corregir automáticamente diferencias como la de `22-09-26_09-20_GPT` para que una base vacía no siga mostrando 709.

3. **Agregar “Seleccionar todas”**
   - Incorporar un control visible en “Cruzar con bases” para seleccionar o desmarcar de una vez todas las bases disponibles.

4. **Validar el flujo**
   - Comprobar que abrir una base muestra sus contactos reales y que la selección total funciona en ambos sentidos.

## Nota sobre la base actual
La base `22-09-26_09-20_GPT` tiene 709 en su contador, pero la base de datos confirma que contiene 0 contactos. El archivo original debe volver a cargarse porque esos 709 registros no quedaron guardados.
