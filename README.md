# Naturvation Decision Support Visualization
## Abstract
This project presents an interactive, web-based visualization tool that supports exploratory decision-making for Nature-Based Solutions (NbS). This project combined coordinated views, including a world map, Sankey diagram, bar chart, and status overview, which enables users to analyze NbS projects across geographical regions, sustainability challenges, intervention types, and implementation status. The interface follows a progressive disclosure approach, allowing users to move from a global overview to detailed project-level information and comparison. The tool is designed to help policymakers, researchers, and practitioners better understand patterns, trade-offs, and opportunities within the Naturvation Atlas dataset.

The tool allows users to:

- Explore where NbS projects are located globally
- Understand how challenges addressed map to different NbS types
- See distributions of NbS types and project statuses
- Filter projects dynamically across all views
- Compare up to three projects side-by-side using aligned attributes

### Visualisations
--------------
1. Projects by Continent (Map)
- Displays the number of projects per continent
- Clicking a continent filters all other views
- Supports zooming and resetting

2. Challenge to NbS Type (Sankey Diagram)
- Shows relationships between challenges addressed and NbS types
- Projects may contribute to multiple links
- Node order remains fixed to preserve mental mapping during filtering

3. Projects by NbS Type (Bar Chart)
- Shows the number of projects that include each NbS type
- Projects may appear in multiple bars
- Clicking a bar or label filters all views
- Includes an information pop-up explaining how to interpret the chart

4. Project Status (Donut Chart)
- Shows the distribution of project statuses
- Clicking a segment filters all views
- Non-selected segments are visually muted to preserve context

### Filters
--------------
Users can filter projects by:
- Country
- NbS Type
- Challenge addressed
- Project status

Active filters are displayed to support transparency and user understanding.

### Comparison Feature
--------------
Users can add up to three projects to a comparison basket.

Comparison design characteristics:
- Projects are displayed side-by-side
- Rows are aligned across projects to support easy comparison
- Attributes include status, challenges addressed, NbS types, cost, location, and source
- Projects can be removed individually from the comparison

### Design Rationale
--------------
Key design principles applied in this tool include:
- Coordinated multiple views: interactions in one view update all others
- Context preservation: non-selected elements are muted rather than removed
- Stable layouts: visual order remains consistent during filtering
- Explainability: tooltips and information pop-ups support novice users
- Comparability: aligned rows reduce cognitive load during comparison

## External Libraries and Resources
- D3.js:
  
  Used for all visualizations and interactions.
- d3-sankey:
  
  Used to construct the Challenge → Type Sankey diagram.
- TopoJSON Client:
  
  Used to render the world map from geographic data.
- Bootstrap:
  
  Used for basic UI elements such as buttons and dropdowns.
  
## Project Structure
### Code
- index.html
  
  Main HTML file defining the dashboard layout and UI structure.
- js/app.js
  
  Core application logic implemented with D3.js. Includes data loading, filtering logic, cross-view coordination, map interaction, and project detail overlays.
- js/data_generator.js
  
  A utility script developed by the team to generate and simulate data for testing and demonstration purposes.
- css/style.css
  
  Custom styling for dashboard layout, panels, filters, and overlays.

### Data Files
- cleaned_data.csv / cleaned_data.xlsx:
  
  Cleaned NbS project dataset derived from the Naturvation Atlas.
- world_countries_110m.topojson:
  
  World map geometry used for the geographic visualization.
- geocoded_*.csv:
  
  Geocoded project locations (latitude and longitude).

### Other Required Files
- Persona Selection: Persona Selection.docx
- Data Wrangling: data_cleaning.ipynb
- Data Understanding: VIS_visualization.ipynb
- Sketches: 
- Interface Design: Final theoretical design.docx
- Think-Aloud study：

## How to Run the Project
This project must be run via a local web server in order to load the CSV data correctly.

Using Python:
- python -m http.server 8080
- Then open a browser and navigate to: http://localhost:8080/Template1

Using VS Code:
- Open the project folder in VS Code.
- Install the Live Server extension.
- Right-click index.html.
- Select “Open with Live Server”.
- The dashboard will open in your browser.

## Team Members
Hannah Melissa Lear (8094152)

Yixuan An (9750134)

Jelke de Haan (4454502)
