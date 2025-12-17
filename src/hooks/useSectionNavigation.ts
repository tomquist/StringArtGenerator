import { useState, useEffect } from "react"

interface Section {
  id: string
  label: string
}

// Hook for managing section navigation
export function useSectionNavigation(sections: Section[]) {
  const [activeSection, setActiveSection] = useState<string>("")

  useEffect(() => {
    const observers = new Map<string, IntersectionObserver>()

    sections.forEach(({ id }) => {
      const element = document.getElementById(id)
      if (element) {
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) {
              setActiveSection(id)
            }
          },
          {
            threshold: 0.5,
            rootMargin: "-80px 0px -80px 0px"
          }
        )
        observer.observe(element)
        observers.set(id, observer)
      }
    })

    return () => {
      observers.forEach(observer => observer.disconnect())
    }
  }, [sections])

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return {
    activeSection,
    scrollToSection
  }
}
